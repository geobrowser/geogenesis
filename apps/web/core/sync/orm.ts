import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { type FetchQueryOptions, QueryClient } from '@tanstack/react-query';

import { Effect } from 'effect';
import { dedupeWith } from 'effect/Array';

import { type EntitiesOrderBy } from '~/core/gql/graphql';
import { convertWhereConditionToEntityFilter, extractTypeIdsFromWhere } from '~/core/io/converters';
import { SortOrder } from '~/core/io/sort-order';

import { readTypes } from '../database/entities';
import {
  ENTITY_ID_BATCH_SIZE,
  getAllEntities,
  getBatchEntities,
  getBatchEntitySpaces,
  getEntitiesOrderedByPropertyConnection,
  getEntity,
  getEntityNames,
  getRelation,
  getResultsPage,
  getSpaces,
  hasDefaultSearchExcludedType,
} from '../io/queries';
import { capSearchQuery } from '../io/search-query';
import { OmitStrict } from '../types';
import { Entity, Relation, SearchResult, SpaceEntity } from '../types';
import { Entities } from '../utils/entity';
import { compareBySpaceRank } from '../utils/space/space-ranking';
import { hasName } from '../utils/utils';
// @TODO replace with Values.merge()
import { merge } from '../utils/value/values';
import { EntityQuery, WhereCondition } from './experimental_query-layer';
import { GeoStore, dedupeRelationsByKey, relationKey } from './store';

/**
 * Every read the sync layer makes goes through here.
 *
 * `staleTime` on the app's `QueryClient` exists for `useQuery` — it decides whether a *mount* or a
 * *focus* refetches. The same setting also governs `fetchQuery`, where it decides something else
 * entirely: whether an imperative "go and get this" issues a request at all. A cached key inside
 * the window returns without touching the network.
 *
 * That is the wrong default here. Every call routed through this helper is a deliberate read,
 * usually to reconcile local state against the indexer, and one silently answered from cache is a
 * sync that returns pre-write data — wrong in a way nothing renders differently for.
 *
 * A helper rather than a spread-in constant on purpose. Spread at each call site, the opt-out is
 * eight separate things that can be dropped one at a time, and a *new* read added later inherits
 * the global default by saying nothing. Here there is one place to get it right, `staleTime` is
 * applied last so a caller cannot reintroduce the window by accident, and a test can assert no
 * raw `fetchQuery` remains in this layer.
 *
 * The cost is real and accepted: an entity synced several times during one page load makes several
 * requests. Collapsing those belongs to whatever stops the sync being triggered that many times,
 * not to a cache window wide enough to hide a stale read.
 */
export function syncFetchQuery<TData>(
  cache: QueryClient,
  options: Omit<FetchQueryOptions<TData>, 'staleTime'>
): Promise<TData> {
  return cache.fetchQuery({ ...options, staleTime: 0 } as FetchQueryOptions<TData>);
}

export function resolveSearchSpaces(
  spaces: Array<string | SpaceEntity>,
  spacesById: Record<string, SpaceEntity>
): SpaceEntity[] {
  return spaces
    .map(space => {
      const spaceId = typeof space === 'string' ? space : space.spaceId;

      return spacesById[spaceId] ?? (typeof space === 'string' ? null : space);
    })
    .filter((space): space is SpaceEntity => space !== null);
}

type SearchResultWithResolvableSpaces = OmitStrict<SearchResult, 'spaces'> & { spaces: Array<string | SpaceEntity> };

export function getSearchResultNameForTopSpace(
  result: Pick<SearchResult, 'name' | 'namesBySpace'>,
  spaces: SpaceEntity[]
): string | null {
  const topSpaceName = result.namesBySpace?.[spaces[0]?.spaceId ?? ''];
  if (hasName(topSpaceName)) return topSpaceName ?? null;
  return hasName(result.name) ? result.name : null;
}

export function applyKnownEntitySpaces(
  result: SearchResult,
  knownEntity: Pick<Entity, 'spaces'> | null | undefined
): SearchResultWithResolvableSpaces {
  if (!knownEntity) return result;

  return {
    ...result,
    spaces: knownEntity.spaces,
  };
}

export function isDisplayableSearchResult(result: Pick<SearchResult, 'name' | 'spaces'>): boolean {
  return result.spaces.length > 0 && hasName(result.name);
}

export function isIncludedSearchResult(result: Pick<SearchResult, 'name' | 'spaces' | 'types'>): boolean {
  return isDisplayableSearchResult(result) && !hasDefaultSearchExcludedType(result.types);
}

function getLocalSearchResultSpaces(values: Entity['values'], relations: Entity['relations']): string[] {
  return Entities.spaces(values, relations);
}

export function mergeResolvableSpaces(
  remoteSpaces: Array<string | SpaceEntity>,
  localSpaces: string[]
): Array<string | SpaceEntity> {
  const seen = new Set(remoteSpaces.map(space => (typeof space === 'string' ? space : space.spaceId)));
  const merged = [...remoteSpaces];

  for (const space of localSpaces) {
    if (!seen.has(space)) {
      seen.add(space);
      merged.push(space);
    }
  }

  return merged;
}

function getLocalNamesBySpace(values: Entity['values']): Record<string, string | null> {
  return Object.fromEntries(
    values
      .filter(value => value.property.id === SystemIds.NAME_PROPERTY)
      .map(value => [value.spaceId, hasName(value.value) ? value.value : null])
  );
}

export function mergeRelations(localRelations: Relation[], remoteRelations: Relation[]) {
  const locallyDeleted = localRelations.filter(r => r.isDeleted);
  const deletedRelationIds = new Set(locallyDeleted.map(r => r.id));
  const deletedRelationKeys = new Set(locallyDeleted.map(relationKey));

  const remoteRelationsThatWerentDeleted = remoteRelations.filter(r => {
    if (deletedRelationIds.has(r.id)) return false;
    if (deletedRelationKeys.has(relationKey(r))) return false;
    return true;
  });

  const localRelationIds = new Set(localRelations.map(r => r.id));
  const remotes: Relation[] = [];

  for (const remoteRelation of remoteRelationsThatWerentDeleted) {
    if (!localRelationIds.has(remoteRelation.id)) {
      remotes.push(remoteRelation);
    }
  }

  // Collapse semantic duplicates (same from/type/to/space) like the store does
  // on hydrate, so duplicate relations in the published graph don't render the
  // same block multiple times through `mergeWith` reads.
  return dedupeRelationsByKey([...localRelations, ...remotes]);
}

/**
 * The `where` a fuzzy page is cached and requested under: the caller's, with the query capped.
 *
 * Keyed on the raw query instead, every keystroke past the cap mints a fresh entry for a request
 * that is byte-identical to the last one. Note this collapses the entries, not the requests: these
 * reads go through `syncFetchQuery`, so a key hit still goes to the network. (Before the client had
 * global defaults, the same was true for a different reason — a bare `QueryClient` left every page
 * stale on arrival.) Not re-running the search at all is the *caller's* outer query key, which each
 * of the four callers now caps for itself.
 *
 * Both the cache key and the request arguments read the query from here, so what is cached and
 * what is fetched cannot disagree about what was asked. Returns the caller's own object when the
 * cap didn't bite, so an ordinary query keeps its identity and nothing re-renders on a new
 * reference.
 */
export function fuzzyPageCacheWhere(where: WhereCondition): WhereCondition {
  const fuzzy = where.name?.fuzzy ?? '';
  const capped = capSearchQuery(fuzzy);

  if (fuzzy === capped) return where;

  return { ...where, name: { ...where.name, fuzzy: capped } };
}

/**
 * The Entity data model is in charge of querying and merging
 * data related to entities at-hoc. There might be instances
 * where we want to query (pull) data rather than sync it.
 */
export class E {
  static merge({
    id,
    spaceId,
    store,
    mergeWith,
  }: {
    id: string;
    spaceId?: string;
    store: GeoStore;
    mergeWith?: Entity | null;
  }): Entity | null {
    const remoteEntity = mergeWith;

    // Read unscoped and filter below. Reading it scoped meant `liveValues` held only the requested
    // space, so the cross-space fallback had nothing to fall back to and an entity named in another
    // locally-loaded space still rendered untitled (GEO-2778).
    const localEntity = store.getEntity(id, { includeDeleted: true });

    if (!localEntity && !remoteEntity) {
      return null;
    }

    if (!remoteEntity) {
      return store.getEntity(id) ?? null;
    }

    if (!localEntity) {
      if (!spaceId) return remoteEntity;
      // `EntityDtoLive` copies the API's aggregate `description`, which is the graph's rather than
      // this space's — returning it unchanged would hand back the top-ranked space's prose behind
      // the scoping. Names may legitimately come from the aggregate; descriptions may not.
      const remoteValues = remoteEntity.values.filter(v => !v.isDeleted);
      return {
        ...remoteEntity,
        name: Entities.nameInSpace(remoteValues, spaceId) ?? remoteEntity.name,
        description: Entities.descriptionInSpace(remoteValues, spaceId),
      };
    }

    const mergedValues = merge(localEntity.values, remoteEntity.values);

    const liveValues = mergedValues.filter(v => !v.isDeleted);
    const values = liveValues.filter(v => (spaceId ? v.spaceId === spaceId : true));

    const mergedRelations = mergeRelations(localEntity.relations, remoteEntity.relations);
    const relations = mergedRelations.filter(r => !r.isDeleted && (spaceId ? r.spaceId === spaceId : true));

    // Use the merged triples to derive the name instead of the remote entity
    // `name` property in case the name was deleted/changed locally.
    //
    // Read from `liveValues` rather than the space-filtered `values`: this path was already scoped
    // but had no fallback, so an entity a space had never named rendered untitled there rather than
    // borrowing the graph's name. `nameInSpace` scopes and falls back in one place (GEO-2778).
    // `?? remoteEntity.name`: a space-scoped response carries no other space's name triples, but its
    // aggregate `name` still holds the graph's. Without this the merge discards the only fallback
    // available whenever those triples were never hydrated locally.
    const name = Entities.nameInSpace(liveValues, spaceId) ?? remoteEntity.name;
    const description = spaceId
      ? Entities.descriptionInSpace(liveValues, spaceId)
      : (Entities.description(liveValues) ?? remoteEntity.description);
    const types = readTypes(relations);
    const derivedSpaces = Entities.spaces(values, relations);
    const spaces = derivedSpaces.length > 0 ? derivedSpaces : remoteEntity.spaces;

    return {
      id: id,
      name,
      spaces,
      description,
      types,
      values: values,
      relations: relations,
      /**
       * Carried rather than derived. Everything above is rebuilt from the merged values and
       * relations, but timestamps are server metadata with no local counterpart, so reconstructing
       * the entity without them silently strips what the query fetched.
       *
       * That matters because consumers read a missing timestamp as "not hydrated yet" and fall back
       * to their own per-row fetch — the remote is preferred, and the local copy is the fallback so
       * an entity already in the store keeps whatever it had.
       */
      createdAt: remoteEntity.createdAt ?? localEntity.createdAt,
      updatedAt: remoteEntity.updatedAt ?? localEntity.updatedAt,
    };
  }

  static async findOne(args: {
    id: string;
    spaceId?: string;
    store: GeoStore;
    cache: QueryClient;
  }): Promise<Entity | null> {
    const { merged } = await this.syncOne(args);
    return merged;
  }

  /**
   * Same as findOne, but also returns the raw remote entity alongside the
   * merged result. Sync consumers need the raw remote to maintain a clean
   * baseline in `syncedEntities` — the merged result strips remote values
   * whose ids collide with local overrides, which would otherwise leak local
   * edits into the baseline and break net-change diffing.
   */
  static async syncOne({
    id,
    store,
    spaceId,
    cache,
  }: {
    id: string;
    spaceId?: string;
    store: GeoStore;
    cache: QueryClient;
  }): Promise<{ merged: Entity | null; remote: Entity | null }> {
    if (id === '') return { merged: null, remote: null };

    const cachedEntity = await syncFetchQuery(cache, {
      queryKey: ['network', 'entity', id, spaceId],
      queryFn: ({ signal }) => Effect.runPromise(getEntity(id, spaceId, signal)),
    });

    return {
      merged: this.merge({ id, store, spaceId, mergeWith: cachedEntity }),
      remote: cachedEntity ?? null,
    };
  }

  static async findOneRelation({
    id,
    spaceId,
    cache,
  }: {
    id: string;
    spaceId?: string;
    cache: QueryClient;
  }): Promise<Entity | null> {
    if (id === '') return null;

    const cachedEntity = await syncFetchQuery(cache, {
      queryKey: ['network', 'relation', id, spaceId],
      queryFn: ({ signal }) => Effect.runPromise(getRelation(id, spaceId, signal)),
    });

    return cachedEntity;
  }

  static async findMany(args: {
    store: GeoStore;
    cache: QueryClient;
    where: WhereCondition;
    first: number;
    after?: string;
    offset?: number;
    spaceId?: string;
    sort?: { propertyId: string; direction: 'asc' | 'desc'; dataType?: string; includeWithoutValue?: boolean };
  }): Promise<Entity[]> {
    const { merged } = await this.syncMany(args);
    return merged;
  }

  /**
   * Same as findMany, but also returns the raw remote entities alongside the
   * merged result. Sync consumers need the raw remote to maintain a clean
   * baseline in `syncedEntities` — the merged result strips remote values
   * whose ids collide with local overrides, which would otherwise leak local
   * edits into the baseline and break net-change diffing.
   */
  static async syncMany({
    store,
    cache,
    where,
    first,
    after,
    offset,
    spaceId,
    sort,
    orderBy,
  }: {
    store: GeoStore;
    cache: QueryClient;
    where: WhereCondition;
    first: number;
    after?: string;
    offset?: number;
    spaceId?: string;
    sort?: { propertyId: string; direction: 'asc' | 'desc'; dataType?: string; includeWithoutValue?: boolean };
    orderBy?: EntitiesOrderBy[];
  }): Promise<{ merged: Entity[]; remote: Entity[]; endCursor: string | null; hasNextPage: boolean }> {
    if (where?.id?.in) {
      const entityIds = where.id.in.filter(id => id !== '');

      if (sort) {
        const filter = convertWhereConditionToEntityFilter(where);
        const page = await Effect.runPromise(
          getEntitiesOrderedByPropertyConnection({
            propertyId: sort.propertyId,
            sortDirection: sort.direction === 'asc' ? SortOrder.Asc : SortOrder.Desc,
            dataType: sort.dataType,
            includeWithoutValue: sort.includeWithoutValue,
            spaceId,
            limit: first,
            after,
            offset,
            filter,
          })
        );

        const remoteEntities = page.entities;
        const remoteById = new Map(remoteEntities.map(e => [e.id as string, e]));
        const merged = remoteEntities
          .map(e => this.merge({ id: e.id, store, spaceId, mergeWith: remoteById.get(e.id) }))
          .filter((e): e is Entity => e !== null);
        return { merged, remote: remoteEntities, endCursor: page.endCursor, hasNextPage: page.hasNextPage };
      }

      const remoteEntities = (
        await Promise.all(
          Array.from({ length: Math.ceil(entityIds.length / ENTITY_ID_BATCH_SIZE) }, (_, index) => {
            const batchIds = entityIds.slice(index * ENTITY_ID_BATCH_SIZE, (index + 1) * ENTITY_ID_BATCH_SIZE);
            return syncFetchQuery(cache, {
              queryKey: ['network', 'entities', batchIds, spaceId],
              queryFn: ({ signal }) => Effect.runPromise(getBatchEntities(batchIds, spaceId, signal)),
            });
          })
        )
      ).flat();

      const remoteById = new Map(remoteEntities.map(e => [e.id as string, e]));

      const entities = entityIds.map(entityId => {
        return this.merge({ id: entityId, store, spaceId, mergeWith: remoteById.get(entityId) });
      });

      const nonNullEntities = entities.filter((e): e is Entity => e !== null);

      const hasAdditionalFilters = Object.keys(where).some(key => key !== 'id');
      if (hasAdditionalFilters) {
        const localQuery = new EntityQuery(nonNullEntities).where(where);
        return { merged: localQuery.execute(), remote: remoteEntities, endCursor: null, hasNextPage: false };
      }

      return { merged: nonNullEntities, remote: remoteEntities, endCursor: null, hasNextPage: false };
    }

    const filter = convertWhereConditionToEntityFilter(where);
    const typeIds = extractTypeIdsFromWhere(where);

    const page = sort
      ? await Effect.runPromise(
          getEntitiesOrderedByPropertyConnection({
            propertyId: sort.propertyId,
            sortDirection: sort.direction === 'asc' ? SortOrder.Asc : SortOrder.Desc,
            dataType: sort.dataType,
            includeWithoutValue: sort.includeWithoutValue,
            spaceId,
            limit: first,
            after,
            offset,
            filter,
          })
        )
      : await Effect.runPromise(
          getAllEntities({
            limit: first,
            after,
            offset,
            filter,
            typeIds,
            orderBy,
          })
        );

    const remoteEntities = page.entities;

    // The merged result is exactly the server page, with local edits overlaid
    // per id by `merge`. Local store entities matching `where` must NOT be
    // appended here: entities synced into the store while viewing one page
    // would be re-appended to every other page, duplicating them across
    // pagination (GEO-2181). Unpublished local entities are surfaced on the
    // first page by the hook layer (mergeUnpublishedLocalEntities) instead.
    const dedupedRemoteIds = dedupeWith(
      remoteEntities.map(e => e.id),
      (a, b) => a === b
    );

    const remoteById = new Map(remoteEntities.map(e => [e.id as string, e]));

    const merged = dedupedRemoteIds
      .map(entityId => this.merge({ id: entityId, store, spaceId, mergeWith: remoteById.get(entityId) }))
      .filter((e): e is Entity => e !== null);

    return { merged, remote: remoteEntities, endCursor: page.endCursor, hasNextPage: page.hasNextPage };
  }

  static async findFuzzy(args: {
    store: GeoStore;
    cache: QueryClient;
    where: WhereCondition;
    first: number;
    skip: number;
    additionalSpaceIds?: string[];
  }): Promise<SearchResult[]> {
    const page = await this.findFuzzyPage(args);
    return page.results;
  }

  /**
   * Same as findFuzzy but exposes the raw REST /search count alongside the
   * post-processed results. Paginated callers need this because the post-
   * processing step filters out entities whose spaces cannot be resolved —
   * a full 25-row REST page can shrink to <25 results, which would otherwise
   * be mistaken for "end of the result set".
   */
  static async findFuzzyPage({
    store,
    cache,
    where,
    first,
    skip,
    signal,
    additionalSpaceIds,
    includeNonCanonical,
  }: {
    store: GeoStore;
    cache: QueryClient;
    where: WhereCondition;
    first: number;
    skip: number;
    signal?: AbortController['signal'];
    additionalSpaceIds?: string[];
    includeNonCanonical?: boolean;
  }): Promise<{ results: SearchResult[]; rawCount: number; serverCount: number; total: number }> {
    // Empty string is intentional here: the REST /search endpoint accepts
    // an empty query and returns top-N globally ranked entities (optionally
    // constrained by typeIds / spaceId). Callers that want paginated "every
    // entity of this type" results pass '' on purpose.
    // Both the cache key and the request below read the query from here, so the thing cached and
    // the thing fetched cannot disagree about what was asked.
    const cacheWhere = fuzzyPageCacheWhere(where);
    const nameFilter = cacheWhere.name?.fuzzy ?? '';

    const spaceIdsFilter = where.space?.id?.equals ? where.space.id.equals : undefined;
    const typeIdsFilter = where.types?.map(t => t.id?.equals).filter(t => t !== undefined) ?? [];

    const page = await syncFetchQuery(cache, {
      queryKey: [
        'network',
        'entities',
        'fuzzy',
        'page',
        cacheWhere,
        first,
        skip,
        additionalSpaceIds,
        includeNonCanonical,
      ],
      queryFn: ({ signal: innerSignal }) =>
        Effect.runPromise(
          getResultsPage(
            {
              limit: first,
              offset: skip,
              query: nameFilter,
              spaceId: spaceIdsFilter ? spaceIdsFilter : undefined,
              typeIds: typeIdsFilter,
              additionalSpaceIds,
              includeNonCanonical,
            },
            // Prefer the caller-supplied signal so React Query cancellation
            // on the hook side (query change, unmount) aborts the in-flight
            // REST /search request instead of letting it run to completion.
            signal ?? innerSignal
          )
        ),
    });
    const remoteEntities = page.results;

    const localEntities = new EntityQuery(store.getEntities()).where(where).execute();

    // Preserve remote (API relevance) ordering; append local-only entities at the end
    const remoteIds = remoteEntities.map(e => e.id);
    const dedupedRemoteIds = Array.from(new Set(remoteIds));
    const remoteIdSet = new Set(dedupedRemoteIds);
    const localOnlyIds = localEntities.filter(e => !remoteIdSet.has(e.id)).map(e => e.id);
    const mergedIds = [...dedupedRemoteIds, ...localOnlyIds];
    const remoteEntityDetails =
      dedupedRemoteIds.length > 0
        ? await syncFetchQuery(cache, {
            queryKey: ['network', 'entities', 'fuzzy', 'entity-spaces', dedupedRemoteIds],
            queryFn: ({ signal: innerSignal }) =>
              Effect.runPromise(getBatchEntitySpaces(dedupedRemoteIds, signal ?? innerSignal)),
          })
        : [];
    const remoteEntityDetailsById = new Map(remoteEntityDetails.map(e => [e.id, e]));
    const remoteById = new Map(
      remoteEntities.map(e => [e.id as string, applyKnownEntitySpaces(e, remoteEntityDetailsById.get(e.id))])
    );

    const maybeEntities = mergedIds.map(entityId => {
      return mergeSearchResult({ id: entityId, store, mergeWith: remoteById.get(entityId) });
    });

    const entities = maybeEntities
      .filter(e => e !== null)
      .filter(entity => !hasDefaultSearchExcludedType(entity.types));

    const spaceIds = [
      ...new Set(entities.flatMap(e => e.spaces.map(space => (typeof space === 'string' ? space : space.spaceId)))),
    ];
    const typeIds = [...new Set(entities.flatMap(e => e.types.map(t => t.id)))];

    const [spaces, typeNames] = await Promise.all([
      syncFetchQuery(cache, {
        queryKey: ['network', 'entities', 'fuzzy', 'spaces', spaceIds],
        queryFn: ({ signal: innerSignal }) => Effect.runPromise(getSpaces({ spaceIds }, signal ?? innerSignal)),
      }),
      typeIds.length > 0
        ? syncFetchQuery(cache, {
            queryKey: ['network', 'entities', 'fuzzy', 'type-names', typeIds],
            queryFn: ({ signal: innerSignal }) => Effect.runPromise(getEntityNames(typeIds, signal ?? innerSignal)),
          })
        : Promise.resolve([]),
    ]);

    const spacesById = Object.fromEntries(spaces.map(space => [space.id, space.entity]));
    const typeNamesById = new Map(typeNames.map(t => [t.id, t.name]));

    const results = entities
      .map(e => {
        const resolvedSpaces = resolveSearchSpaces(e.spaces, spacesById)
          .filter(s => hasName(s.name))
          .sort(compareBySpaceRank(s => s.spaceId));

        const resolvedTypesBySpace = e.typesBySpace
          ? Object.fromEntries(
              Object.entries(e.typesBySpace).map(([spaceId, types]) => [
                spaceId,
                types.map(t => ({ id: t.id, name: t.name ?? typeNamesById.get(t.id) ?? null })),
              ])
            )
          : undefined;

        return {
          ...e,
          name: getSearchResultNameForTopSpace(e, resolvedSpaces),
          types: e.types.map(t => ({
            id: t.id,
            name: t.name ?? typeNamesById.get(t.id) ?? null,
          })),
          typesBySpace: resolvedTypesBySpace,
          spaces: resolvedSpaces,
        };
      })
      .filter(isIncludedSearchResult);

    return { results, rawCount: page.rawCount, serverCount: page.serverCount, total: page.total };
  }
}

function mergeSearchResult({
  id,
  store,
  mergeWith,
}: {
  id: string;
  store: GeoStore;
  mergeWith?: SearchResultWithResolvableSpaces | null;
}): (OmitStrict<SearchResult, 'spaces'> & { spaces: Array<string | SpaceEntity> }) | null {
  const remoteEntity = mergeWith;

  // We need to include the deleted to correctly merge with remote data
  const localEntity = store.getEntity(id);

  if (!localEntity && !remoteEntity) {
    return null;
  }

  if (!remoteEntity) {
    // Should always be true because of above check
    return localEntity ?? null;
  }

  if (!localEntity) {
    return {
      ...remoteEntity,
      spaces: remoteEntity.spaces,
    };
  }

  const values = localEntity.values.filter(t => Boolean(t.isDeleted) === false);
  const relations = localEntity.relations.filter(t => Boolean(t.isDeleted) === false);

  // Use the merged triples to derive the name instead of the remote entity
  // `name` property in case the name was deleted/changed locally.
  const name = Entities.name(values) ?? remoteEntity.name;
  const description = Entities.description(values) ?? remoteEntity.description;
  const types = dedupeWith([...readTypes(relations), ...remoteEntity.types], (a, z) => a.id === z.id);
  const namesBySpace = {
    ...remoteEntity.namesBySpace,
    ...getLocalNamesBySpace(values),
  };

  return {
    id: id,
    name,
    description,
    types,
    namesBySpace,
    typesBySpace: remoteEntity.typesBySpace,
    spaces: mergeResolvableSpaces(remoteEntity.spaces, getLocalSearchResultSpaces(values, relations)),
  };
}

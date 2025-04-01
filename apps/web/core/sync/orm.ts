import { SystemIds } from '@graphprotocol/grc-20';
import { QueryClient } from '@tanstack/react-query';
import { dedupeWith } from 'effect/Array';

import { Filter } from '../blocks/data/filters';
import { queryStringFromFilters } from '../blocks/data/to-query-string';
import { Triple } from '../database/Triple';
import { readTypes } from '../database/entities';
import { Entity } from '../io/dto/entities';
import { SearchResult } from '../io/dto/search';
import { EntityId } from '../io/schema';
import { fetchEntity, fetchResults, fetchSpaces, fetchTableRowEntities } from '../io/subgraph';
import { fetchEntitiesBatch } from '../io/subgraph/fetch-entities-batch';
import { OmitStrict, Relation } from '../types';
import { Entities } from '../utils/entity';
import { Triples } from '../utils/triples';
import { EntityQuery, WhereCondition } from './experimental_query-layer';
import { GeoStore } from './store';

function mergeRelations(localRelations: Relation[], remoteRelations: Relation[]) {
  const locallyDeletedRelations = localRelations.filter(r => r.isDeleted).map(r => r.id);

  const deletedRelationIds = new Set(locallyDeletedRelations);
  const remoteRelationsThatWerentDeleted = remoteRelations
    // Only return initialRelations that haven't been deleted locally
    .filter(r => !deletedRelationIds.has(r.id));

  const localRelationIds = new Set(localRelations.map(r => r.id));
  const remotes: Relation[] = [];

  // Filter out any remoet relations that are already stored locally
  for (const remoteRelation of remoteRelationsThatWerentDeleted) {
    if (!localRelationIds.has(remoteRelation.id)) {
      remotes.push(remoteRelation);
    }
  }

  // @TODO: Merge local triples for updated (not created) relations. This is for things like
  // the index.
  return [...localRelations, ...remotes];
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
  }) {
    const remoteEntity = mergeWith;

    // We need to include the deleted to correctly merge with remote data
    const localEntity = store.getEntity(id, { spaceId, includeDeleted: true });

    if (!localEntity && !remoteEntity) {
      return null;
    }

    if (!remoteEntity) {
      return localEntity ?? null;
    }

    if (!localEntity) {
      return remoteEntity;
    }

    const mergedTriples = Triples.merge(
      localEntity.triples.map(t =>
        Triple.make(t, {
          hasBeenPublished: t.hasBeenPublished,
          isDeleted: t.isDeleted,
        })
      ),
      remoteEntity.triples
    );

    const triples = mergedTriples.filter(t => (Boolean(t.isDeleted) === false && spaceId ? t.space === spaceId : true));
    const mergedRelations = mergeRelations(localEntity.relationsOut, remoteEntity.relationsOut);
    const relations = mergedRelations.filter(t =>
      Boolean(t.isDeleted) === false && spaceId ? t.space === spaceId : true
    );

    // Use the merged triples to derive the name instead of the remote entity
    // `name` property in case the name was deleted/changed locally.
    const name = Entities.name(triples);
    const description = Entities.description(triples);
    const types = readTypes(relations);

    return {
      id: EntityId(id),
      name,
      nameTripleSpaces: Entities.nameTriples(triples).map(t => t.space),
      spaces: [...(localEntity?.spaces ?? []), ...(remoteEntity?.spaces ?? [])],
      description,
      types,
      triples: triples,
      relationsOut: relations,
      // @TODO: Spaces with metadata
      // @TODO: Schema? Adding schema here might result in infinite queries since we
      // if we called getEntity from within getEntity it would query infinitlely deep
      // until we hit some defined base-case. We could specify a max depth for the
      // recursion so we only return the closest schema and not the whole chain.
      schema: [],
    };
  }

  static async findOne({
    id,
    store,
    spaceId,
    cache,
  }: {
    id: string;
    spaceId?: string;
    store: GeoStore;
    cache: QueryClient;
  }) {
    const cachedEntity = await cache.fetchQuery({
      queryKey: ['network', 'entity', id, spaceId],
      queryFn: ({ signal }) => fetchEntity({ id, signal, spaceId }),
    });

    console.log('cached entity', cachedEntity, spaceId);

    return this.merge({ id, store, spaceId, mergeWith: cachedEntity });
  }

  static async findMany({
    store,
    cache,
    where,
    first,
    skip,
  }: {
    store: GeoStore;
    cache: QueryClient;
    where: WhereCondition;
    first: number;
    skip: number;
  }) {
    if (where?.id?.in) {
      const entityIds = where.id.in;

      const remoteEntities = await cache.fetchQuery({
        queryKey: ['network', 'entities', entityIds],
        queryFn: ({ signal }) => fetchEntitiesBatch({ entityIds, signal }),
      });

      const remoteById = new Map(remoteEntities.map(e => [e.id as string, e]));

      const entities = entityIds.map(entityId => {
        return this.merge({ id: entityId, store, mergeWith: remoteById.get(entityId) });
      });

      return entities.filter(e => e !== null);
    }

    const filters: Filter[] = [];

    if (where.relations) {
      const relationConditions = where.relations
        .map((r): Filter | null => {
          if (r.typeOf?.id?.equals && r.toEntity?.id?.equals) {
            return {
              columnId: r.typeOf.id.equals,
              columnName: null,
              value: r.toEntity.id.equals,
              valueName: null,
              valueType: 'RELATION',
            };
          }

          return null;
        })
        .filter(f => f !== null);

      filters.push(...relationConditions);
    }

    if (where.triples) {
      const tripleConditions = where.triples
        .map((t): Filter | null => {
          if (t.attributeId?.equals && t.value?.equals) {
            return {
              columnId: t.attributeId.equals,
              columnName: null,
              value: t.value.equals.toString(),
              valueName: null,
              valueType: 'TEXT', // SUPPORT OTHER TYPES
            };
          }

          return null;
        })
        .filter(f => f !== null);

      filters.push(...tripleConditions);
    }

    if (where.spaces) {
      const relationConditions = where.spaces
        .map((s): Filter | null => {
          if (s.equals) {
            return {
              columnId: SystemIds.SPACE_FILTER,
              columnName: null,
              value: s.equals,
              valueName: null,
              valueType: 'RELATION',
            };
          }

          return null;
        })
        .filter(f => f !== null);

      filters.push(...relationConditions);
    }

    const filterString = queryStringFromFilters(filters);

    const remoteEntities = await cache.fetchQuery({
      queryKey: ['network', 'entities', filters],
      queryFn: ({ signal }) => fetchTableRowEntities({ filter: filterString, signal, first, skip }),
    });

    const localEntities = new EntityQuery(store).where(where).execute();

    const mergedIds = [...new Set([...remoteEntities.map(e => e.id), ...localEntities.map(e => e.id)])];

    const remoteById = new Map(remoteEntities.map(e => [e.id as string, e]));

    const entities = mergedIds.map(entityId => {
      return this.merge({ id: entityId, store, mergeWith: remoteById.get(entityId) });
    });

    return entities.filter(e => e !== null);
  }

  static async findFuzzy({
    store,
    cache,
    where,
    first,
    skip,
  }: {
    store: GeoStore;
    cache: QueryClient;
    where: WhereCondition;
    first: number;
    skip: number;
  }): Promise<SearchResult[]> {
    const nameFilter = where.name?.fuzzy;
    const typeIdsFilter = where.types?.map(t => t.id?.equals).filter(t => t !== undefined) ?? [];

    const remoteEntities = await cache.fetchQuery({
      queryKey: ['network', 'entities', 'fuzzy', where],
      queryFn: ({ signal }) => fetchResults({ first, skip, query: nameFilter, typeIds: typeIdsFilter, signal }),
    });

    const localEntities = new EntityQuery(store).where(where).execute();

    const mergedIds = [...new Set([...remoteEntities.map(e => e.id), ...localEntities.map(e => e.id)])];
    const remoteById = new Map(remoteEntities.map(e => [e.id as string, e]));

    const maybeEntities = mergedIds.map(entityId => {
      return mergeSearchResult({ id: entityId, store, mergeWith: remoteById.get(entityId) });
    });

    const entities = maybeEntities.filter(e => e !== null);

    const spaceIds = [...new Set(entities.flatMap(e => e.spaces))];

    const spaces = await cache.fetchQuery({
      queryKey: ['network', 'entities', 'fuzzy', 'spaces', spaceIds],
      queryFn: () =>
        fetchSpaces({
          spaceIds,
        }),
    });

    const spacesById = Object.fromEntries(spaces.map(s => [s.id, s]));

    return entities.map(e => {
      return {
        ...e,
        spaces: e.spaces.map(s => {
          const space = spacesById[s];

          return space.spaceConfig;
        }),
      };
    });
  }
}

function mergeSearchResult({
  id,
  store,
  mergeWith,
}: {
  id: string;
  store: GeoStore;
  mergeWith?: SearchResult | null;
}): (OmitStrict<SearchResult, 'spaces'> & { spaces: string[] }) | null {
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
      spaces: remoteEntity.spaces.map(s => s.spaceId),
    };
  }

  const triples = localEntity.triples.filter(t => Boolean(t.isDeleted) === false);
  const relations = localEntity.relationsOut.filter(t => Boolean(t.isDeleted) === false);

  // Use the merged triples to derive the name instead of the remote entity
  // `name` property in case the name was deleted/changed locally.
  const name = Entities.name(triples) ?? remoteEntity.name;
  const description = Entities.description(triples) ?? remoteEntity.name;
  const types = dedupeWith([...readTypes(relations), ...remoteEntity.types], (a, z) => a.id === z.id);

  return {
    id: EntityId(id),
    name,
    description,
    types,
    spaces: localEntity.spaces,
  };
}

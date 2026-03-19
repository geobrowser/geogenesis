import { QueryClient } from '@tanstack/react-query';
import { Effect } from 'effect';
import { dedupeWith } from 'effect/Array';

import { convertWhereConditionToEntityFilter, extractTypeIdsFromWhere } from '~/core/io/converters';

import { ROOT_SPACE } from '../constants';
import { readTypes } from '../database/entities';
import { getAllEntities, getBatchEntities, getEntity, getRelation, getResults, getSpaces } from '../io/queries';
import { OmitStrict } from '../types';
import { Entity, Relation, SearchResult } from '../types';
import { Entities } from '../utils/entity';
// @TODO replace with Values.merge()
import { merge } from '../utils/value/values';
import { EntityQuery, WhereCondition } from './experimental_query-layer';
import { GeoStore } from './store';

function relationKey(r: Relation): string {
  return `${r.fromEntity.id}:${r.type.id}:${r.toEntity.id}:${r.spaceId ?? ''}`;
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
  }): Entity | null {
    const remoteEntity = mergeWith;

    const localEntity = store.getEntity(id, { includeDeleted: true, spaceId });

    if (!localEntity && !remoteEntity) {
      return null;
    }

    if (!remoteEntity) {
      return store.getEntity(id) ?? null;
    }

    if (!localEntity) {
      return remoteEntity;
    }

    const mergedValues = merge(localEntity.values, remoteEntity.values);

    const values = mergedValues.filter(v => !v.isDeleted && (spaceId ? v.spaceId === spaceId : true));

    const mergedRelations = mergeRelations(localEntity.relations, remoteEntity.relations);
    const relations = mergedRelations.filter(r => !r.isDeleted && (spaceId ? r.spaceId === spaceId : true));

    // Use the merged triples to derive the name instead of the remote entity
    // `name` property in case the name was deleted/changed locally.
    const name = Entities.name(values);
    const description = Entities.description(values);
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
  }): Promise<Entity | null> {
    if (id === '') return null;

    const cachedEntity = await cache.fetchQuery({
      queryKey: ['network', 'entity', id, spaceId],
      queryFn: ({ signal }) => Effect.runPromise(getEntity(id, spaceId, signal)),
    });

    return this.merge({ id, store, spaceId, mergeWith: cachedEntity });
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

    const cachedEntity = await cache.fetchQuery({
      queryKey: ['network', 'relation', id, spaceId],
      queryFn: ({ signal }) => Effect.runPromise(getRelation(id, spaceId, signal)),
    });

    return cachedEntity;
  }

  static async findMany({
    store,
    cache,
    where,
    first,
    skip,
    spaceId,
  }: {
    store: GeoStore;
    cache: QueryClient;
    where: WhereCondition;
    first: number;
    skip: number;
    spaceId?: string;
  }) {
    if (where?.id?.in) {
      const entityIds = where.id.in.filter(id => id !== '');

      const remoteEntities = await cache.fetchQuery({
        queryKey: ['network', 'entities', entityIds, spaceId],
        queryFn: async ({ signal }) => {
          // @TODO: error handle
          const entities = await Effect.runPromise(getBatchEntities(entityIds, spaceId, signal));
          return entities;
        },
      });

      const remoteById = new Map(remoteEntities.map(e => [e.id as string, e]));

      const entities = entityIds.map(entityId => {
        return this.merge({ id: entityId, store, spaceId, mergeWith: remoteById.get(entityId) });
      });

      const nonNullEntities = entities.filter(e => e !== null);

      // Apply additional filters (like name, values, etc.) if present
      // Check if there are any filters beyond just id.in
      const hasAdditionalFilters = Object.keys(where).some(key => key !== 'id');
      if (hasAdditionalFilters) {
        const localQuery = new EntityQuery(nonNullEntities).where(where);
        return localQuery.execute();
      }

      return nonNullEntities;
    }

    const limit = first;
    const offset = skip;
    const filter = convertWhereConditionToEntityFilter(where);
    const typeIds = extractTypeIdsFromWhere(where);

    const remoteEntities = await Effect.runPromise(
      getAllEntities({
        limit,
        offset,
        filter,
        typeIds,
      })
    );

    const localEntities = new EntityQuery(store.getEntities()).where(where).execute();

    const mergedIds = [...new Set([...remoteEntities.map(e => e.id), ...localEntities.map(e => e.id)])];

    const remoteById = new Map(remoteEntities.map(e => [e.id as string, e]));

    const entities = mergedIds.map(entityId => {
      return this.merge({ id: entityId, store, spaceId, mergeWith: remoteById.get(entityId) });
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

    if (!nameFilter) {
      console.error('findFuzzy requires a query. Received: ', nameFilter);
      return [];
    }

    const spaceIdsFilter = where.space?.id?.equals ? where.space.id.equals : undefined;
    const typeIdsFilter = where.types?.map(t => t.id?.equals).filter(t => t !== undefined) ?? [];

    const remoteEntities = await cache.fetchQuery({
      queryKey: ['network', 'entities', 'fuzzy', where],
      queryFn: ({ signal }) =>
        Effect.runPromise(
          getResults(
            {
              limit: first,
              offset: skip,
              query: nameFilter,
              spaceId: spaceIdsFilter ? spaceIdsFilter : undefined,
              typeIds: typeIdsFilter,
            },
            signal
          )
        ),
    });

    const localEntities = new EntityQuery(store.getEntities()).where(where).execute();

    const mergedIds = [...new Set([...remoteEntities.map(e => e.id), ...localEntities.map(e => e.id)])];
    const remoteById = new Map(remoteEntities.map(e => [e.id as string, e]));

    const maybeEntities = mergedIds.map(entityId => {
      return mergeSearchResult({ id: entityId, store, mergeWith: remoteById.get(entityId) });
    });

    const entities = maybeEntities.filter(e => e !== null);

    const typeNameMap = await resolveTypeNames(
      entities.flatMap(e => e.types),
      store,
      cache
    );

    const spaceIds = [...new Set(entities.flatMap(e => e.spaces))];

    const spaces = await cache.fetchQuery({
      queryKey: ['network', 'entities', 'fuzzy', 'spaces', spaceIds],
      queryFn: () =>
        Effect.runPromise(
          getSpaces({
            spaceIds,
          })
        ),
    });

    const spacesById = Object.fromEntries(spaces.map(s => [s.id, s]));

    return entities.map(e => {
      return {
        ...e,
        types: applyTypeNames(e.types, typeNameMap),
        spaces: e.spaces.map(s => {
          const space = spacesById[s];

          return space.entity;
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

  const values = localEntity.values.filter(t => Boolean(t.isDeleted) === false);
  const relations = localEntity.relations.filter(t => Boolean(t.isDeleted) === false);

  // Use the merged triples to derive the name instead of the remote entity
  // `name` property in case the name was deleted/changed locally.
  const name = Entities.name(values) ?? remoteEntity.name;
  const description = Entities.description(values) ?? remoteEntity.description;
  const types = dedupeWith([...readTypes(relations), ...remoteEntity.types], (a, z) => a.id === z.id);

  return {
    id: id,
    name,
    description,
    types,
    spaces: localEntity.spaces,
  };
}

// @TODO remove once the backend resolves type names using space ranking
async function resolveTypeNames(
  types: { id: string; name: string | null }[],
  store: GeoStore,
  cache: QueryClient
): Promise<Map<string, string>> {
  const typeNameMap = new Map<string, string>();
  const uniqueTypeIds = [...new Set(types.map(t => t.id))];

  if (uniqueTypeIds.length === 0) return typeNameMap;

  const unresolvedTypeIds: string[] = [];

  for (const typeId of uniqueTypeIds) {
    const localTypeEntity = store.getEntity(typeId);
    if (localTypeEntity?.name) {
      typeNameMap.set(typeId, localTypeEntity.name);
    } else {
      unresolvedTypeIds.push(typeId);
    }
  }

  if (unresolvedTypeIds.length > 0) {
    try {
      const rootSpaceEntities = await cache.fetchQuery({
        queryKey: ['network', 'entities', 'type-names', ROOT_SPACE, unresolvedTypeIds.sort().join(',')],
        queryFn: () => Effect.runPromise(getBatchEntities(unresolvedTypeIds, ROOT_SPACE)),
      });

      for (const entity of rootSpaceEntities) {
        const nameFromValues = Entities.name(entity.values);
        const resolvedName = nameFromValues ?? entity.name;
        if (resolvedName) {
          typeNameMap.set(entity.id, resolvedName);
        }
      }
    } catch {}
  }

  return typeNameMap;
}

function applyTypeNames(
  types: { id: string; name: string | null }[],
  nameMap: Map<string, string>
): { id: string; name: string | null }[] {
  if (nameMap.size === 0) return types;

  return types.map(t => {
    const resolvedName = nameMap.get(t.id);
    return resolvedName !== undefined ? { ...t, name: resolvedName } : t;
  });
}

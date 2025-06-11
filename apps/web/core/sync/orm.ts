import { SystemIds } from '@graphprotocol/grc-20';
import { QueryClient } from '@tanstack/react-query';
import { Effect } from 'effect';
import { dedupeWith } from 'effect/Array';

import { Filter } from '../blocks/data/filters';
import { queryStringFromFilters } from '../blocks/data/to-query-string';
import { readTypes } from '../database/entities';
import { EntityId } from '../io/schema';
import { fetchEntity, fetchResults, fetchSpaces, fetchTableRowEntities } from '../io/subgraph';
import { getBatchEntities, getEntity } from '../io/v2/queries';
import { OmitStrict } from '../types';
import { Entities } from '../utils/entity';
import { Values } from '../utils/value';
import { Entity, Relation, SearchResult } from '../v2.types';
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
  }): Entity | null {
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

    const mergedValues = Values.merge(localEntity.values, remoteEntity.values);

    const values = mergedValues.filter(v => (Boolean(v.isDeleted) === false && spaceId ? v.spaceId === spaceId : true));

    const mergedRelations = mergeRelations(localEntity.relations, remoteEntity.relations);
    const relations = mergedRelations.filter(r =>
      Boolean(r.isDeleted) === false && spaceId ? r.spaceId === spaceId : true
    );

    // Use the merged triples to derive the name instead of the remote entity
    // `name` property in case the name was deleted/changed locally.
    const name = Entities.name(values);
    const description = Entities.description(values);
    const types = readTypes(relations);

    return {
      id: EntityId(id),
      name,
      spaces: [...(localEntity?.spaces ?? []), ...(remoteEntity?.spaces ?? [])],
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
    const cachedEntity = await cache.fetchQuery({
      queryKey: ['network', 'entity', id, spaceId],
      queryFn: ({ signal }) => Effect.runPromise(getEntity(id, spaceId, signal)),
    });

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
        queryFn: async ({ signal }) => {
          // @TODO: error handle
          const entities = await Effect.runPromise(getBatchEntities(entityIds, undefined, signal));
          return entities;
        },
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

    if (where.values) {
      const tripleConditions = where.values
        .map((t): Filter | null => {
          if (t.propertyId?.equals && t.value?.equals) {
            return {
              columnId: t.propertyId.equals,
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
    const spaceIdsFilter = where.space?.id?.equals ? where.space.id.equals : undefined;
    const typeIdsFilter = where.types?.map(t => t.id?.equals).filter(t => t !== undefined) ?? [];

    const remoteEntities = await cache.fetchQuery({
      queryKey: ['network', 'entities', 'fuzzy', where],
      queryFn: ({ signal }) =>
        fetchResults({ first, skip, query: nameFilter, spaceId: spaceIdsFilter, typeIds: typeIdsFilter, signal }),
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

  const values = localEntity.values.filter(t => Boolean(t.isDeleted) === false);
  const relations = localEntity.relations.filter(t => Boolean(t.isDeleted) === false);

  // Use the merged triples to derive the name instead of the remote entity
  // `name` property in case the name was deleted/changed locally.
  const name = Entities.name(values) ?? remoteEntity.name;
  const description = Entities.description(values) ?? remoteEntity.name;
  const types = dedupeWith([...readTypes(relations), ...remoteEntity.types], (a, z) => a.id === z.id);

  return {
    id: EntityId(id),
    name,
    description,
    types,
    spaces: localEntity.spaces,
  };
}

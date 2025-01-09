import { SYSTEM_IDS } from '@geogenesis/sdk';
import { Array, Duration } from 'effect';
import { dedupeWith } from 'effect/Array';

import { Filter } from '../blocks-sdk/table';
import { Entity } from '../io/dto/entities';
import { fetchColumns } from '../io/fetch-columns';
import { EntityId } from '../io/schema';
import { fetchTableRowEntities } from '../io/subgraph';
import { fetchEntitiesBatch } from '../io/subgraph/fetch-entities-batch';
import { queryClient } from '../query-client';
import { Schema, Value } from '../types';
import { EntityWithSchema, getEntities_experimental, mergeEntity, mergeEntityAsync } from './entities';
import { getRelations } from './relations';

const queryKeys = {
  remoteRows: (options: Parameters<typeof fetchTableRowEntities>[0]) =>
    ['blocks', 'data', 'query', 'rows', options] as const,
  localRows: (entityIds: string[]) => ['blocks', 'data', 'query', 'rows', 'merging', entityIds] as const,
  columns: (typeIds: string[]) => ['blocks', 'data', 'query', 'columns', 'merging', typeIds] as const,
  remoteCollectionItems: (entityIds: string[]) => ['blocks', 'data', 'collection', 'merging', entityIds] as const,
  remoteEntities: (entityIds: string[]) => ['blocks', 'data', 'entity', 'merging', entityIds] as const,
};

export interface MergeTableEntitiesArgs {
  filterState: Filter[];
  options: {
    first?: number;
    skip?: number;
    filter: string; // this is a graphql query string
  };
}

/**
 * Few things we need to support
 * 1. Just fetch remote entities
 * 2. Merge remote entities with local entities
 * 3. Filter them with a selector (either manual one or one derived from FilterState)
 */
async function mergeTableRowEntitiesAsync(
  options: Parameters<typeof fetchTableRowEntities>[0],
  filterState: Filter[]
): Promise<EntityWithSchema[]> {
  const cachedEntities = await queryClient.fetchQuery({
    queryKey: queryKeys.remoteRows(options),
    queryFn: ({ signal }) => fetchTableRowEntities({ ...options, signal }),
  });

  const remoteMergedEntities = cachedEntities.map(e => mergeEntity({ id: e.id, mergeWith: e }));
  const alreadyMergedEntitiesIds = new Set(remoteMergedEntities.map(e => e.id));

  const localEntities = await getEntities_experimental();
  const filteredLocalEntities = Object.values(localEntities)
    .filter(entity => {
      for (const filter of filterState) {
        if (filter.columnId === SYSTEM_IDS.SPACE_FILTER) {
          const maybeTripleSpace = entity.triples.find(
            t => t.attributeId === SYSTEM_IDS.SPACE_FILTER && t.space === filter.value
          );

          const maybeRelationSpace = entity.relationsOut.find(r => r.space === filter.value);
          return maybeTripleSpace || maybeRelationSpace;
        }

        if (filter.valueType === 'RELATION') {
          return entity.relationsOut.some(r => r.typeOf.id === filter.columnId && r.toEntity.id === filter.value);
        }

        return entity.triples.some(triple => {
          if (filter.columnId === SYSTEM_IDS.SPACE_FILTER) {
            // @HACK: We special-case `space` since it's not an attribute:value in an entity but is a property
            // attached to a triple in the data model. Once we represents entities across multiple spaces
            // this filter likely won't make sense anymore.
            // @TODO: We now store the entitySpaces on the entity itself
            return triple.space.includes(filter.value);
          }

          return triple.attributeId === filter.columnId && filterValue(triple.value, filter.value);
        });
      }
    })
    .map(e => e.id)

    // Filter out entities we've already merged so we don't fetch them again
    .filter(id => !alreadyMergedEntitiesIds.has(id));

  // If an entity exists locally and was given properties that now match it to
  // the filters then we need to fetch its remote contents to make sure we have
  // all the data needed to merge it with the local state, filter and render it.
  // @TODO(performance): Batch instead of fetching an unknown number of them at once.
  const localMergedEntities = await queryClient.fetchQuery({
    queryKey: queryKeys.localRows(filteredLocalEntities),
    queryFn: () => Promise.all(filteredLocalEntities.map(id => mergeEntityAsync(EntityId(id)))),
  });

  return [...localMergedEntities, ...remoteMergedEntities];
}

export async function mergeTableEntities({ options, filterState }: MergeTableEntitiesArgs) {
  return await mergeTableRowEntitiesAsync(options, filterState);
}

export async function mergeColumns(typeIds: string[]): Promise<Schema[]> {
  const cachedColumns = await queryClient.fetchQuery({
    queryKey: queryKeys.columns(typeIds),
    queryFn: () => fetchColumns({ typeIds: typeIds }),
  });

  const localAttributesForSelectedType = getRelations({
    selector: r => r.typeOf.id === SYSTEM_IDS.PROPERTIES && typeIds.includes(r.fromEntity.id),
  }).map((r): Schema => {
    return {
      id: r.toEntity.id,
      name: r.toEntity.name,
      // @TODO: use the real value type
      valueType: SYSTEM_IDS.TEXT,
    };
  });

  return dedupeWith([...cachedColumns, ...localAttributesForSelectedType], (a, b) => a.id === b.id);
}

/**
 * Few things we need to support
 * 1. Just fetch remote entities
 * 2. Merge remote entities with local entities
 * 3. Filter them with a selector (either manual one or one derived from FilterState)
 */
async function mergeCollectionRowEntitiesAsync(entityIds: string[]): Promise<Entity[]> {
  const cachedRemoteEntities = await queryClient.fetchQuery({
    queryKey: queryKeys.remoteCollectionItems(entityIds),
    queryFn: ({ signal }) => fetchEntitiesBatch(entityIds, signal),
    staleTime: Duration.toMillis(Duration.seconds(20)),
  });

  const merged = cachedRemoteEntities.map(e => mergeEntity({ id: e.id, mergeWith: e }));

  const localEntities = await getEntities_experimental();
  const relevantLocalEntities = Object.values(localEntities).filter(l => entityIds.includes(l.id));
  const localOnlyEntityIds = Array.difference(
    relevantLocalEntities.map(e => e.id),
    merged.map(m => m.id)
  );

  const localOnlyEntities = localOnlyEntityIds
    .map(entityId => {
      return localEntities[entityId] ?? null;
    })
    .filter(e => e !== null);

  return [...localOnlyEntities, ...merged];
}

export async function mergeCollectionItemEntitiesAsync(entityIds: string[]) {
  // @TODO(data-block): filters, pagination
  return await mergeCollectionRowEntitiesAsync(entityIds);
}

function filterValue(value: Value, valueToFilter: string) {
  switch (value.type) {
    case 'TEXT':
      return value.value === valueToFilter;
    case 'URL':
      return value.value === valueToFilter;
    default:
      return false;
  }
}

export async function mergeEntitySourceTypeEntities(entityId: string, filterState: Filter[]) {
  const entity = await mergeEntityAsync(EntityId(entityId));
  const maybeRelationType = filterState.find(f => f.columnId === SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE)?.value;

  if (!maybeRelationType) {
    return [];
  }

  // @TODO:
  // encode/decode as filter string
  const entityIdsToFetch = entity.relationsOut.filter(r => r.typeOf.id === maybeRelationType).map(r => r.toEntity.id);

  const cachedRemoteEntities = await queryClient.fetchQuery({
    queryKey: queryKeys.remoteEntities(entityIdsToFetch),
    queryFn: ({ signal }) => fetchEntitiesBatch(entityIdsToFetch, signal),
    staleTime: Duration.toMillis(Duration.seconds(20)),
  });

  const mergedRemoteEntities = cachedRemoteEntities.map(e => mergeEntity({ id: e.id, mergeWith: e }));

  const localEntities = await getEntities_experimental();
  const relevantLocalEntities = Object.values(localEntities).filter(e => entityIdsToFetch.includes(e.id));
  return dedupeWith([...relevantLocalEntities, ...mergedRemoteEntities], (a, b) => a.id === b.id);
}

import { SYSTEM_IDS } from '@geogenesis/sdk';
import { Array, Duration } from 'effect';
import { dedupeWith } from 'effect/Array';

import { createFiltersFromGraphQLStringAndSource } from '../blocks-sdk/table';
import { Entity } from '../io/dto/entities';
import { fetchColumns } from '../io/fetch-columns';
import { fetchTableRowEntities } from '../io/subgraph';
import { fetchEntitiesBatch } from '../io/subgraph/fetch-entities-batch';
import { queryClient } from '../query-client';
import { Source } from '../state/editor/types';
import { Schema, Value } from '../types';
import { EntityWithSchema, getEntities_experimental, mergeEntity, mergeEntityAsync } from './entities';
import { getRelations } from './relations';

const queryKeys = {
  remoteRows: (options: Parameters<typeof fetchTableRowEntities>[0]) =>
    ['blocks', 'data', 'query', 'rows', options] as const,
  localRows: (entityIds: string[]) => ['blocks', 'data', 'query', 'rows', 'merged', entityIds] as const,
  columns: (typeIds: string[]) => ['blocks', 'data', 'query', 'columns', 'merging', typeIds] as const,
  remoteCollectionItems: (entityIds: string[]) => ['blocks', 'data', 'collection', 'merging', entityIds] as const,
};

export interface MergeTableEntitiesArgs {
  source: Source;
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
  options: Parameters<typeof fetchTableRowEntities>[0]
): Promise<EntityWithSchema[]> {
  const cachedEntities = await queryClient.fetchQuery({
    queryKey: queryKeys.remoteRows(options),
    queryFn: ({ signal }) => fetchTableRowEntities({ ...options, signal }),
  });

  const remoteMergedEntities = cachedEntities.map(e => mergeEntity({ id: e.id, mergeWith: e }));
  const alreadyMergedEntitiesIds = new Set(remoteMergedEntities.map(e => e.id));

  // Get all local entities with at least one relation. If we've passed in typeIds
  // as a filter then we should only return local entities that match those ids.
  //
  // Our queries usually require at least one type which is why we can safely use
  // the relations merging to aggregate entities.
  const localEntities = getRelations({
    selector: () => {
      // @TODO(data-block): Map the filter string into a selector so local relations
      // are correctly filtered.
      return true;
    },
  })
    .map(r => r.fromEntity.id)
    // Filter out entities we've already merged so we don't fetch them again
    .filter(id => !alreadyMergedEntitiesIds.has(id));

  // If an entity exists locally and was given properties that now match it to
  // the filters then we need to fetch its remote contents to make sure we have
  // all the data needed to merge it with the local state, filter and render it.
  // @TODO(performance): Batch instead of fetching an unknown number of them at once.
  const localMergedEntities = await queryClient.fetchQuery({
    queryKey: queryKeys.localRows(localEntities),
    queryFn: () => Promise.all(localEntities.map(id => mergeEntityAsync(id))),
  });

  return [...localMergedEntities, ...remoteMergedEntities];
}

export async function mergeTableEntities({ options, source }: MergeTableEntitiesArgs) {
  const entities = await mergeTableRowEntitiesAsync(options);

  const filterState = await createFiltersFromGraphQLStringAndSource(options.filter ?? '', source);

  return entities.filter(entity => {
    for (const filter of filterState) {
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

    return true;
  });
}

export async function mergeColumns(typeIds: string[]): Promise<Schema[]> {
  const cachedColumns = await queryClient.fetchQuery({
    queryKey: queryKeys.columns(typeIds),
    queryFn: () => fetchColumns({ typeIds: typeIds }),
  });

  const localAttributesForSelectedType = getRelations({
    selector: r => r.typeOf.id === SYSTEM_IDS.ATTRIBUTES && typeIds.includes(r.fromEntity.id),
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
    case 'ENTITY':
      return value.value === valueToFilter;
    default:
      return false;
  }
}

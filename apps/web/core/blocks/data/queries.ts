import { SYSTEM_IDS } from '@geogenesis/sdk';
import { Array, Duration } from 'effect';
import { dedupeWith } from 'effect/Array';

import { getEntities_experimental, mergeEntity, mergeEntityAsync } from '~/core/database/entities';
import { getRelations } from '~/core/database/relations';
import { Entity } from '~/core/io/dto/entities';
import { fetchColumns } from '~/core/io/fetch-columns';
import { EntityId } from '~/core/io/schema';
import { fetchTableRowEntities } from '~/core/io/subgraph';
import { fetchEntitiesBatch } from '~/core/io/subgraph/fetch-entities-batch';
import { queryClient } from '~/core/query-client';
import { PropertySchema, Value } from '~/core/types';

import { Filter } from './filters';

const queryKeys = {
  remoteRows: (options: Parameters<typeof fetchTableRowEntities>[0]) =>
    ['blocks', 'data', 'query', 'rows', options] as const,
  localRows: (entityIds: string[]) => ['blocks', 'data', 'query', 'rows', 'merging', entityIds] as const,
  columns: (typeIds: string[]) => ['blocks', 'data', 'query', 'columns', 'merging', typeIds] as const,
  remoteCollectionItems: (entityIds: string[], filterState: Filter[], filterString?: string) =>
    ['blocks', 'data', 'collection', 'merging', entityIds, filterState, filterString] as const,
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
): Promise<Entity[]> {
  const cachedEntities = await queryClient.fetchQuery({
    queryKey: queryKeys.remoteRows(options),
    queryFn: ({ signal }) => fetchTableRowEntities({ ...options, signal }),
  });

  const remoteMergedEntities = cachedEntities.map(e => mergeEntity({ id: e.id, mergeWith: e }));
  const alreadyMergedEntitiesIds = new Set(remoteMergedEntities.map(e => e.id));

  const localEntities = await getEntities_experimental();
  const localOnlyEntitiesIds = filterLocalEntities(Object.values(localEntities), filterState)
    .map(e => e.id)
    // Filter out entities we've already merged so we don't fetch them again
    .filter(id => !alreadyMergedEntitiesIds.has(id));

  // If an entity exists locally and was given properties that now match it to
  // the filters then we need to fetch its remote contents to make sure we have
  // all the data needed to merge it with the local state, filter and render it.
  // @TODO(performance): Batch instead of fetching an unknown number of them at once.
  const localMergedEntities = await queryClient.fetchQuery({
    queryKey: queryKeys.localRows(localOnlyEntitiesIds),
    queryFn: () => Promise.all(localOnlyEntitiesIds.map(id => mergeEntityAsync(EntityId(id)))),
  });

  return [...localMergedEntities, ...remoteMergedEntities];
}

export async function mergeTableEntities({ options, filterState }: MergeTableEntitiesArgs) {
  return await mergeTableRowEntitiesAsync(options, filterState);
}

export async function mergeColumns(typeIds: string[]): Promise<PropertySchema[]> {
  const cachedColumns = await queryClient.fetchQuery({
    queryKey: queryKeys.columns(typeIds),
    queryFn: () => fetchColumns({ typeIds: typeIds }),
  });

  const localAttributesForSelectedType = getRelations({
    selector: r => r.typeOf.id === SYSTEM_IDS.PROPERTIES && typeIds.includes(r.fromEntity.id),
  }).map((r): PropertySchema => {
    return {
      id: r.toEntity.id,
      name: r.toEntity.name,
      // @TODO: use the real value type
      valueType: SYSTEM_IDS.TEXT,
    };
  });

  return dedupeWith([...cachedColumns, ...localAttributesForSelectedType], (a, b) => a.id === b.id);
}

type CollectionItemArgs = {
  entityIds: string[];
  filterString?: string;
  filterState: Filter[];
};

export async function mergeEntitiesAsync(args: CollectionItemArgs) {
  const { entityIds, filterString, filterState } = args;

  const cachedRemoteEntities = await queryClient.fetchQuery({
    queryKey: queryKeys.remoteCollectionItems(entityIds, filterState, filterString),
    queryFn: ({ signal }) => fetchEntitiesBatch(entityIds, filterString, signal),
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

  const filteredLocal = filterLocalEntities(localOnlyEntities, filterState);

  return [...filteredLocal, ...merged];
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

export async function mergeRelationQueryEntities(entityId: string, filterString: string, filterState: Filter[]) {
  const entity = await mergeEntityAsync(EntityId(entityId));
  const maybeRelationType = filterState.find(f => f.columnId === SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE)?.value;

  if (!maybeRelationType) {
    return [];
  }

  const entityIdsToFetch = entity.relationsOut.filter(r => r.typeOf.id === maybeRelationType).map(r => r.toEntity.id);

  const cachedRemoteEntities = await queryClient.fetchQuery({
    queryKey: queryKeys.remoteEntities(entityIdsToFetch),
    queryFn: ({ signal }) => fetchEntitiesBatch(entityIdsToFetch, filterString, signal),
    staleTime: Duration.toMillis(Duration.seconds(20)),
  });

  const mergedRemoteEntities = cachedRemoteEntities.map(e => mergeEntity({ id: e.id, mergeWith: e }));

  const localEntities = await getEntities_experimental();
  const relevantLocalEntities = Object.values(localEntities).filter(e => entityIdsToFetch.includes(e.id));
  return dedupeWith([...relevantLocalEntities, ...mergedRemoteEntities], (a, b) => a.id === b.id);
}

function filterLocalEntities(entities: Entity[], filterState: Filter[]) {
  // Needs to return if _all_ are true, not just if one is true
  return entities.filter(entity => {
    return filterState.every(filter => {
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
    });
  });
}

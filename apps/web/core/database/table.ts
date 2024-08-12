import { SYSTEM_IDS } from '@geogenesis/sdk';

import { TableBlockSdk } from '../blocks-sdk';
import { EntityId } from '../io/schema';
import { fetchTableRowEntities } from '../io/subgraph';
import { getRelations } from '../merged/relations';
import { queryClient } from '../query-client';
import { Value } from '../types';
import { EntityWithSchema, mergeEntity, mergeEntityAsync } from './entities';

export interface MergeTableEntitiesArgs {
  options: {
    first?: number;
    skip?: number;
    typeIds?: string[];
    filter: string; // this is a graphql query string
  };
  selectedTypeId: EntityId;
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
    queryKey: ['table-entities-for-merging', options],
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
    selector: r => {
      if (options.typeIds && options.typeIds.length > 0) {
        return (
          r.typeOf.id === SYSTEM_IDS.SCHEMA_TYPE &&
          r.typeOf.id === SYSTEM_IDS.TYPES &&
          options.typeIds.includes(r.toEntity.id)
        );
      }

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
  const localMergedEntities = await Promise.all(localEntities.map(id => mergeEntityAsync(id)));
  return [...localMergedEntities, ...remoteMergedEntities];
}

export async function mergeTableEntities({ options, selectedTypeId }: MergeTableEntitiesArgs) {
  const entities = await mergeTableRowEntitiesAsync({
    ...options,
    ...(selectedTypeId ? { typeIds: [selectedTypeId] } : {}),
  });

  const filterState = await TableBlockSdk.createFiltersFromGraphQLString(
    options.filter ?? '',
    async id => await mergeEntityAsync(EntityId(id))
  );

  return entities.filter(entity => {
    for (const filter of filterState) {
      return entity.triples.some(triple => {
        // @HACK: We special-case `space` since it's not an attribute:value in an entity but is a property
        // attached to a triple in the data model. Once we represents entities across multiple spaces
        // this filter likely won't make sense anymore.
        if (filter.columnId === 'space') {
          // @TODO: We now store the entitySpaces on the entity itself
          return entity.nameTripleSpaces?.includes(filter.value);
        }

        return triple.attributeId === filter.columnId && filterValue(triple.value, filter.value);
      });
    }

    return true;
  });
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

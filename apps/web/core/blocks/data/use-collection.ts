import { Position, SystemIds } from '@geoprotocol/geo-sdk';
import { keepPreviousData } from '@tanstack/react-query';

import { WhereCondition } from '~/core/sync/experimental_query-layer';
import { useQueryEntities, useQueryEntity } from '~/core/sync/use-store';
import { Relation } from '~/core/types';

import { useDataBlockInstance } from './use-data-block';
import { useSource } from './use-source';

/**
 * Deduplicates relations by toEntity.id, keeping the first occurrence.
 * This handles cases where multiple collection relations point to the same entity.
 */
function deduplicateRelationsByEntityId<T extends Pick<Relation, 'toEntity'>>(relations: T[]): T[] {
  const seen = new Set<string>();
  return relations.filter(relation => {
    if (seen.has(relation.toEntity.id)) {
      return false;
    }
    seen.add(relation.toEntity.id);
    return true;
  });
}

export interface CollectionProps {
  first?: number;
  skip?: number;
  where?: WhereCondition;
}

export function useCollection({ first, skip, where }: CollectionProps) {
  const { entityId, spaceId } = useDataBlockInstance();
  const { source } = useSource();

  const { entity: blockEntity } = useQueryEntity({
    spaceId,
    id: entityId,
    enabled: source.type === 'COLLECTION',
  });

  const collectionRelations =
    source.type === 'COLLECTION'
      ? (blockEntity?.relations.filter(
          r => r.fromEntity.id === source.value && r.type.id === SystemIds.COLLECTION_ITEM_RELATION_TYPE
        ) ?? [])
      : [];

  const deduplicatedRelations = deduplicateRelationsByEntityId(collectionRelations);

  const orderedCollectionRelations = deduplicatedRelations.sort((a, z) => {
    return Position.compare(a.position ?? null, z.position ?? null);
  });

  // When filters are present, we need to fetch ALL collection items first,
  // apply the filter, then paginate the filtered results
  const hasFilters = where && Object.keys(where).length > 0;

  // Get all entity IDs when filtering, or just the current page when not filtering
  const entityIdsToFetch = hasFilters
    ? orderedCollectionRelations.map(r => r.toEntity.id)
    : orderedCollectionRelations.slice(skip || 0, (skip || 0) + (first || 9)).map(r => r.toEntity.id);

  // Build the where condition for collection items
  const collectionItemsWhere: WhereCondition = {
    id: {
      in: entityIdsToFetch,
    },
    ...(where ?? {}),
  };

  const { entities: collectionItems, isLoading: isCollectionItemsLoading } = useQueryEntities({
    enabled: entityIdsToFetch.length > 0,
    where: collectionItemsWhere,
    placeholderData: keepPreviousData,
  });

  /**
   * When filtering is active, we need to:
   * 1. Get all entities that match both the collection AND the filter
   * 2. Filter the relations to only include those that point to filtered entities
   * 3. Deduplicate filtered relations (in case filtering reveals duplicates)
   * 4. Apply pagination to the filtered relations
   * 5. Return the paginated items in the correct order
   */
  const filteredRelations = hasFilters
    ? deduplicateRelationsByEntityId(
        orderedCollectionRelations.filter(r => collectionItems.some(item => item.id === r.toEntity.id))
      )
    : orderedCollectionRelations;

  const pageStartIndex = skip || 0;
  const pageEndIndex = pageStartIndex + (first || 9);
  const paginatedRelations = hasFilters ? filteredRelations.slice(pageStartIndex, pageEndIndex) : filteredRelations;

  /**
   * There's currently no guarantee of ordering when using the `id: { in: [...]}`
   * query in the sync engine. Here we use the ordered relations list as the source
   * of truth for ordering to return the collection item entities in the correct order.
   */
  const collectionItemsMap = new Map(collectionItems.map(item => [item.id, item]));

  const orderedCollectionItems = paginatedRelations
    .map(relation => {
      const entity = collectionItemsMap.get(relation.toEntity.id);
      return entity;
    })
    .filter(item => item !== undefined);

  return {
    collectionItems: orderedCollectionItems,
    collectionRelations: paginatedRelations,
    isLoading: isCollectionItemsLoading,
    isFetched: !isCollectionItemsLoading,
    collectionLength: hasFilters ? filteredRelations.length : collectionRelations.length,
  };
}

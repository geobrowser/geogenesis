import { Position, SystemIds } from '@graphprotocol/grc-20';
import { keepPreviousData } from '@tanstack/react-query';

import { useQueryEntities, useQueryEntity } from '~/core/sync/use-store';

import { useDataBlockInstance } from './use-data-block';
import { useSource } from './use-source';

export interface CollectionProps {
  first?: number;
  skip?: number;
}

export function useCollection({ first, skip }: CollectionProps) {
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

  const orderedCollectionRelations = collectionRelations.sort((a, z) => {
    return Position.compare(a.position ?? null, z.position ?? null);
  });

  // Get the entities for the current page based on position order
  const pageStartIndex = skip || 0;
  const pageEndIndex = pageStartIndex + (first || 9);
  const currentPageRelations = orderedCollectionRelations.slice(pageStartIndex, pageEndIndex);
  const currentPageEntityIds = currentPageRelations.map(r => r.toEntity.id);


  const { entities: collectionItems, isLoading: isCollectionItemsLoading } = useQueryEntities({
    enabled: currentPageEntityIds.length > 0,
    where: {
      id: {
        in: currentPageEntityIds,
      },
    },
    // Don't use first/skip here since we're already slicing the relations
    placeholderData: keepPreviousData,
  });

  /**
   * There's currently no guarantee of ordering when using the `id: { in: [...]}`
   * query in the sync engine. Here we use the ordered relations list as the source
   * of truth for ordering to return the collection item entities in the correct order.
   */
  const collectionItemsMap = new Map(collectionItems.map(item => [item.id, item]));

  const orderedCollectionItems = currentPageRelations
    .map(relation => {
      const entity = collectionItemsMap.get(relation.toEntity.id);

      return entity;
    })
    .filter(item => item !== undefined);

  return {
    collectionItems: orderedCollectionItems,
    collectionRelations: orderedCollectionRelations,
    isLoading: isCollectionItemsLoading,
    isFetched: !isCollectionItemsLoading,
    collectionLength: collectionRelations.length,
  };
}

import { SystemIds } from '@graphprotocol/grc-20';

import { EntityId } from '~/core/io/schema';
import { useQueryEntities, useQueryEntity } from '~/core/sync/use-store';

import { useDataBlockInstance } from './use-data-block';
import { useSource } from './use-source';

export function useCollection() {
  const { entityId, spaceId } = useDataBlockInstance();
  const { source } = useSource();

  const { entity: blockEntity } = useQueryEntity({
    spaceId,
    id: entityId,
    enabled: source.type === 'COLLECTION',
  });

  const collectionItemsRelations =
    source.type === 'COLLECTION'
      ? (blockEntity?.relationsOut.filter(
          r => r.fromEntity.id === source.value && r.typeOf.id === EntityId(SystemIds.COLLECTION_ITEM_RELATION_TYPE)
        ) ?? [])
      : [];

  const orderedCollectionItemRelations = collectionItemsRelations.sort((a, z) =>
    a.index.toLowerCase().localeCompare(z.index.toLowerCase())
  );

  const collectionItemIds = orderedCollectionItemRelations?.map(c => c.toEntity.id) ?? [];
  const collectionRelationIds = orderedCollectionItemRelations?.map(c => c.id) ?? [];

  const { entities: collectionItems, isLoading: isCollectionItemsLoading } = useQueryEntities({
    enabled: collectionItemIds !== null,
    where: {
      id: {
        in: collectionItemIds,
      },
    },
  });

  const { entities: collectionRelations, isLoading: isCollectionRelationsLoading } = useQueryEntities({
    enabled: collectionRelationIds !== null,
    where: {
      id: {
        in: collectionRelationIds,
      },
    },
  });

  /**
   * There's currently no guarantee of ordering when using the `id: { in: [...]}`
   * query in the sync engine. Here we use the ordered relations list as the source
   * of truth for ordering to return the collection item entities in the correct order.
   */
  const collectionItemsMap = new Map(collectionItems.map(item => [item.id, item]));

  const orderedCollectionItems = orderedCollectionItemRelations
    .map(relation => {
      const entity = collectionItemsMap.get(relation.toEntity.id);

      return entity;
    })
    .filter(item => item !== undefined);

  // Don't show loading if we already have data and are just refetching
  const hasExistingData = orderedCollectionItems.length > 0 || collectionRelations.length > 0;
  const isLoading = (isCollectionItemsLoading || isCollectionRelationsLoading) && !hasExistingData;

  return {
    collectionItems: orderedCollectionItems,
    collectionRelations,
    isLoading,
    isFetched: hasExistingData && !isLoading,
  };
}

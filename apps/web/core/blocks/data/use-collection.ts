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

  const orderedCollectionItems = collectionItemsRelations.sort((a, z) =>
    a.index.toLowerCase().localeCompare(z.index.toLowerCase())
  );

  const collectionItemIds = orderedCollectionItems?.map(c => c.toEntity.id) ?? [];
  const collectionRelationIds = orderedCollectionItems?.map(c => c.id) ?? [];

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

  return {
    blockEntity,
    collectionItems,
    collectionRelations,
    isLoading: isCollectionItemsLoading || isCollectionRelationsLoading,
    isFetched: !isCollectionItemsLoading && !isCollectionRelationsLoading,
  };
}

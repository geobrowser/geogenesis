import { SystemIds } from '@graphprotocol/grc-20';

import { useEntity } from '~/core/database/entities';
import { useRelations } from '~/core/database/relations';
import { EntityId } from '~/core/io/schema';
import { useQueryEntities } from '~/core/sync/use-store';

import { useDataBlockInstance } from './use-data-block';
import { useSource } from './use-source';

export function useCollection() {
  const { entityId, spaceId } = useDataBlockInstance();
  const { source } = useSource();

  // @TODO: This should use the sync engine
  const blockEntity = useEntity({
    spaceId: spaceId,
    id: EntityId(entityId),
  });

  // @TODO: This should be from the sync engine.
  const collectionItemsRelations = useRelations({
    mergeWith: blockEntity.relationsOut,
    selector: r => {
      if (source.type !== 'COLLECTION') return false;
      return r.fromEntity.id === source.value && r.typeOf.id === EntityId(SystemIds.COLLECTION_ITEM_RELATION_TYPE);
    },
  });

  const orderedCollectionItems = collectionItemsRelations.sort((a, z) =>
    a.index.toLowerCase().localeCompare(z.index.toLowerCase())
  );

  const collectionItemIds = orderedCollectionItems?.map(c => c.toEntity.id) ?? [];
  const collectionRelationIds = orderedCollectionItems?.map(c => c.id) ?? [];

  const { entities: collectionItems, isLoading: isCollectionItemsLoading } = useQueryEntities({
    where: {
      id: {
        in: collectionItemIds,
      },
    },
  });

  const { entities: collectionRelations, isLoading: isCollectionRelationsLoading } = useQueryEntities({
    where: {
      id: {
        in: collectionRelationIds,
      },
    },
  });

  return {
    collectionItems,
    collectionRelations,
    isLoading: isCollectionItemsLoading || isCollectionRelationsLoading,
    isFetched: !isCollectionItemsLoading && !isCollectionRelationsLoading,
  };
}

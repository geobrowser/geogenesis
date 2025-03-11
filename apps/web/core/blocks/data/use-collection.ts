import { SystemIds } from '@graphprotocol/grc-20';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { useEntity } from '~/core/database/entities';
import { useRelations } from '~/core/database/relations';
import { useTriples } from '~/core/database/triples';
import { EntityId } from '~/core/io/schema';

import { mergeEntitiesAsync } from './queries';
import { useDataBlockInstance } from './use-data-block';
import { useSource } from './use-source';

export function useCollection() {
  const { entityId, spaceId } = useDataBlockInstance();
  const { source } = useSource();

  const blockEntity = useEntity({
    spaceId: spaceId,
    id: EntityId(entityId),
  });

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

  // We need to check for any local changes to collection items in order to re-fetch the list
  // of them and merge with local data.
  const allTriples = useTriples({
    includeDeleted: true,
  }).map(t => t.entityId);

  const allRelations = useRelations({
    includeDeleted: true,
  }).map(r => r.fromEntity.id);

  const changedEntities = [...allTriples, ...allRelations].filter(e => collectionItemIds.includes(EntityId(e)));

  const { data, isLoading, isFetched } = useQuery({
    placeholderData: keepPreviousData,
    enabled: collectionItemsRelations.length > 0,
    queryKey: [
      'blocks',
      'data',
      'collection-items-and-relations',
      collectionItemIds,
      collectionRelationIds,
      changedEntities,
    ],
    queryFn: async () => {
      const [collectionItems, collectionRelations] = await Promise.all([
        mergeEntitiesAsync({
          entityIds: collectionItemIds,
          filterState: [],
        }),
        mergeEntitiesAsync({
          entityIds: collectionRelationIds,
          filterState: [],
        }),
      ]);

      return { collectionItems, collectionRelations };
    },
  });

  return {
    collectionItems: data?.collectionItems ?? [],
    collectionRelations: data?.collectionRelations ?? [],
    isLoading,
    isFetched,
  };
}

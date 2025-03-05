import { SystemIds } from '@graphprotocol/grc-20';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { useEntity } from '~/core/database/entities';
import { useRelations } from '~/core/database/relations';
import { EntityId, SpaceId } from '~/core/io/schema';

import { mergeEntitiesAsync } from './queries';
import { useDataBlockInstance } from './use-data-block';
import { useSource } from './use-source';

export function useCollection() {
  const { entityId, spaceId } = useDataBlockInstance();
  const { source } = useSource();

  const blockEntity = useEntity({
    spaceId: React.useMemo(() => SpaceId(spaceId), [spaceId]),
    id: React.useMemo(() => EntityId(entityId), [entityId]),
  });

  const collectionItemsRelations = useRelations(
    React.useMemo(() => {
      return {
        mergeWith: blockEntity.relationsOut,
        selector: r => {
          if (source.type !== 'COLLECTION') return false;

          // Return all local relations pointing to the collection id in the source block
          // @TODO(data blocks): Merge with any remote collection items
          return r.fromEntity.id === source.value && r.typeOf.id === EntityId(SystemIds.COLLECTION_ITEM_RELATION_TYPE);
        },
      };
    }, [blockEntity.relationsOut, source])
  );

  const collectionItemIds = React.useMemo(
    () => collectionItemsRelations?.map(c => c.toEntity.id) ?? [],
    [collectionItemsRelations]
  );

  const collectionRelationIds = React.useMemo(
    () => collectionItemsRelations?.map(c => c.id) ?? [],
    [collectionItemsRelations]
  );

  const { data, isLoading, isFetched } = useQuery({
    placeholderData: keepPreviousData,
    enabled: collectionItemsRelations.length > 0,
    queryKey: ['blocks', 'data', 'collection-items', collectionItemIds],
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

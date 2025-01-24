import { SYSTEM_IDS } from '@geogenesis/sdk';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { useEntity } from '~/core/database/entities';
import { useRelations } from '~/core/database/relations';
import { EntityId, SpaceId } from '~/core/io/schema';
import { useTableBlockInstance } from '~/core/state/table-block-store';

import { mergeEntitiesAsync } from './queries';
import { useSource } from './use-source';

export function useCollection() {
  const { entityId, spaceId } = useTableBlockInstance();
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
          return r.fromEntity.id === source.value && r.typeOf.id === EntityId(SYSTEM_IDS.COLLECTION_ITEM_RELATION_TYPE);
        },
      };
    }, [blockEntity.relationsOut, source])
  );

  const collectionItemIds = React.useMemo(
    () => collectionItemsRelations?.map(c => c.toEntity.id) ?? [],
    [collectionItemsRelations]
  );

  const {
    data: collectionItems,
    isLoading,
    isFetched,
  } = useQuery({
    placeholderData: keepPreviousData,
    enabled: collectionItemsRelations.length > 0,
    queryKey: ['blocks', 'data', 'collection-items', collectionItemIds],
    queryFn: async () => {
      const entities = await mergeEntitiesAsync({
        entityIds: collectionItemIds,
        filterState: [],
      });

      return entities;
    },
  });

  return {
    collectionItems: collectionItems ?? [],
    isLoading,
    isFetched,
  };
}

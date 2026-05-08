'use client';

import { useQuery } from '@tanstack/react-query';
import { useSelector } from '@xstate/store/react';

import * as React from 'react';

import equal from 'fast-deep-equal';

import { reactiveRelations } from '~/core/sync/store';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import type { Property } from '~/core/types';
import {
  fetchRelationTargetTypeIdsForProperty,
  mergeRelationValueTypesFromStore,
} from '~/core/utils/property/properties';

type RelationValueType = NonNullable<Property['relationValueTypes']>[number];

export function useRelationTargetTypeIds({
  propertyId,
  spaceId,
  relationValueTypes,
}: {
  propertyId: string | undefined;
  spaceId: string | undefined;
  relationValueTypes: Property['relationValueTypes'] | undefined;
}): {
  relationValueTypes: RelationValueType[] | undefined;
  typeIds: string[] | undefined;
  waitForFilterTypes: boolean;
} {
  const { store } = useSyncEngine();
  const relationsSnapshot = useSelector(reactiveRelations, r => r, equal);

  const fromStore = React.useMemo(() => {
    void relationsSnapshot;
    if (!propertyId) return undefined;

    const merged = mergeRelationValueTypesFromStore({ id: propertyId, name: null, dataType: 'RELATION' }, store);
    return merged.relationValueTypes?.length ? merged.relationValueTypes : undefined;
  }, [propertyId, relationsSnapshot, store]);

  const {
    data: fromNetwork,
    isFetching: isFetchingNetworkTypes,
    isPending: isPendingNetworkTypes,
  } = useQuery({
    enabled: Boolean(propertyId) && !fromStore?.length && !relationValueTypes?.length,
    queryKey: ['relation-target-type-ids', propertyId, spaceId],
    queryFn: () => fetchRelationTargetTypeIdsForProperty(propertyId!, spaceId),
    staleTime: 60_000,
  });

  const resolvedRelationValueTypes = React.useMemo(() => {
    if (fromStore?.length) return fromStore;
    if (fromNetwork?.length) return fromNetwork.map(id => ({ id, name: null }));
    return relationValueTypes?.length ? relationValueTypes : undefined;
  }, [fromStore, fromNetwork, relationValueTypes]);

  const typeIds = React.useMemo(
    () => resolvedRelationValueTypes?.map(type => type.id),
    [resolvedRelationValueTypes]
  );

  return {
    relationValueTypes: resolvedRelationValueTypes,
    typeIds,
    waitForFilterTypes: Boolean(propertyId) && !typeIds?.length && (isFetchingNetworkTypes || isPendingNetworkTypes),
  };
}

'use client';

import * as React from 'react';

import { useQueryEntity } from '~/core/sync/use-store';
import { entityHomeSpaceId } from '~/core/utils/space/entity-home-space';

export function useSidePanelEntityScope(entityId: string, requestedSpaceId: string, preferRequestedSpace: boolean) {
  const { entity: unscopedEntity, isLoading: isLoadingHydration } = useQueryEntity({
    id: entityId,
    enabled: Boolean(entityId),
  });

  const derivedSpaceId = React.useMemo(
    () => (unscopedEntity ? (entityHomeSpaceId(unscopedEntity) ?? requestedSpaceId) : requestedSpaceId),
    [unscopedEntity, requestedSpaceId]
  );

  const effectiveSpaceId = React.useMemo(() => {
    if (preferRequestedSpace && (unscopedEntity?.spaces ?? []).includes(requestedSpaceId)) {
      return requestedSpaceId;
    }
    return derivedSpaceId;
  }, [derivedSpaceId, preferRequestedSpace, requestedSpaceId, unscopedEntity]);

  const { entity, isLoading: isLoadingScopedView } = useQueryEntity({
    id: entityId,
    spaceId: effectiveSpaceId,
    enabled: Boolean(entityId && effectiveSpaceId),
  });

  const isLoading = isLoadingHydration || isLoadingScopedView;

  return { entity, effectiveSpaceId, isLoading };
}

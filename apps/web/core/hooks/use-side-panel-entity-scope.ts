'use client';

import * as React from 'react';

import { useQueryEntity } from '~/core/sync/use-store';

import { resolveSidePanelEntityScope } from './resolve-side-panel-entity-scope';

export function useSidePanelEntityScope(entityId: string, requestedSpaceId: string) {
  const { entity: unscopedEntity, isLoading: isLoadingHydration } = useQueryEntity({
    id: entityId,
    enabled: Boolean(entityId),
  });

  const { entity: requestedScopedEntity } = useQueryEntity({
    id: entityId,
    spaceId: requestedSpaceId,
    enabled: Boolean(entityId && requestedSpaceId),
  });

  const effectiveSpaceId = React.useMemo(() => {
    return resolveSidePanelEntityScope({
      requestedSpaceId,
      unscopedEntity,
      requestedScopedEntity,
    }).effectiveSpaceId;
  }, [requestedSpaceId, unscopedEntity, requestedScopedEntity]);

  const { entity, isLoading: isLoadingScopedView } = useQueryEntity({
    id: entityId,
    spaceId: effectiveSpaceId,
    enabled: Boolean(entityId && effectiveSpaceId),
  });

  const isLoading = isLoadingHydration || isLoadingScopedView;

  return { entity, effectiveSpaceId, isLoading };
}

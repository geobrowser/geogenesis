'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { useQueryEntity } from '~/core/sync/use-store';
import { getTopRankedSpaceId } from '~/core/utils/space/space-ranking';

export function useSidePanelEntityScope(entityId: string, requestedSpaceId: string, preferRequestedSpace: boolean) {
  const { entity: unscopedEntity, isLoading: isLoadingHydration } = useQueryEntity({
    id: entityId,
    enabled: Boolean(entityId),
  });

  const derivedSpaceId = React.useMemo(() => {
    const namedSpaceIds = new Set<string>();
    for (const value of unscopedEntity?.values ?? []) {
      if (
        !value.isDeleted &&
        value.property.id === SystemIds.NAME_PROPERTY &&
        typeof value.value === 'string' &&
        value.value.trim().length > 0
      ) {
        namedSpaceIds.add(value.spaceId);
      }
    }

    return (
      getTopRankedSpaceId([...namedSpaceIds]) ?? getTopRankedSpaceId(unscopedEntity?.spaces ?? []) ?? requestedSpaceId
    );
  }, [unscopedEntity, requestedSpaceId]);

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

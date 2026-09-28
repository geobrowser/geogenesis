'use client';

import * as React from 'react';

import { useProfilesBySpaceIds } from '~/core/hooks/use-profiles-by-space-ids';
import {
  type ActiveResponseDirection,
  type ResponseKind,
  type ResponseObjectType,
} from '~/core/responses/entity-response';
import { useEntityResponders } from '~/core/responses/use-entity-responders';

import { RankingAggregatedSubmitterAvatars } from '~/partials/blocks/table/ranking-period-metadata';

export function ClaimResponderAvatars({
  entityId,
  spaceId,
  objectType,
  responseKind,
  totalResponders,
  viewerSpaceId,
  optimisticViewerResponse,
}: {
  entityId: string;
  spaceId: string;
  objectType: ResponseObjectType;
  responseKind: ResponseKind;
  totalResponders: number;
  viewerSpaceId?: string | null;
  optimisticViewerResponse?: ActiveResponseDirection | null;
}) {
  const { responders, queriesEnabled } = useEntityResponders({
    entityId,
    spaceId,
    objectType,
    responseKind,
    viewerSpaceId,
    optimisticViewerResponse,
  });

  const responderSpaceIds = React.useMemo(() => responders.map(responder => responder.userId), [responders]);

  // Batched claim views render their avatars with queries disabled, relying on a cache primed
  // before this response existed — so nothing there would ever fetch the viewer's own profile.
  // Usually it's already cached from the navbar and this resolves without a request.
  const optimisticViewerSpaceIds = React.useMemo(
    () => (viewerSpaceId && optimisticViewerResponse != null ? [viewerSpaceId] : []),
    [optimisticViewerResponse, viewerSpaceId]
  );
  useProfilesBySpaceIds(optimisticViewerSpaceIds);

  if (responderSpaceIds.length === 0) return null;

  return (
    <RankingAggregatedSubmitterAvatars
      submitterSpaceIds={responderSpaceIds}
      totalCount={Math.max(totalResponders, responderSpaceIds.length)}
      size={12}
      queriesEnabled={queriesEnabled}
    />
  );
}

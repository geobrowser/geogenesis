'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { useProfilesBySpaceIds } from '~/core/hooks/use-profiles-by-space-ids';
import { getEntityResponders } from '~/core/io/queries';
import {
  type ActiveResponseDirection,
  type ResponseKind,
  type ResponseObjectType,
  entityRespondersQueryKey,
} from '~/core/responses/entity-response';
import { useClaimResponseBatchState } from '~/core/responses/use-claim-response-summaries';

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
  const responseBatch = useClaimResponseBatchState();
  const { data: responders } = useQuery({
    queryKey: entityRespondersQueryKey(entityId, spaceId, objectType, responseKind),
    queryFn: () => Effect.runPromise(getEntityResponders(entityId, spaceId, responseKind, objectType)),
    enabled: !responseBatch.managed,
    staleTime: 30_000,
  });

  const responderSpaceIds = React.useMemo(() => {
    const indexedResponderIds = responders?.map(v => v.userId) ?? [];
    if (optimisticViewerResponse === undefined || !viewerSpaceId) return indexedResponderIds;

    const otherResponderIds = indexedResponderIds.filter(id => id !== viewerSpaceId);
    return optimisticViewerResponse === null ? otherResponderIds : [viewerSpaceId, ...otherResponderIds];
  }, [optimisticViewerResponse, responders, viewerSpaceId]);

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
      queriesEnabled={!responseBatch.managed}
    />
  );
}

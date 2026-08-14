'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { useGeoProfile } from '~/core/hooks/use-geo-profile';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
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

  // Keep the viewer's profile query warm (same key as the nav)
  const { smartAccount } = useSmartAccount();
  const walletAddress = smartAccount?.account.address;
  const { profile: viewerProfile } = useGeoProfile(walletAddress);

  const viewerAdded =
    !!viewerSpaceId && (optimisticViewerResponse === 'positive' || optimisticViewerResponse === 'negative');

  const knownProfiles = React.useMemo(() => {
    if (!viewerAdded || !viewerSpaceId) return undefined;
    if (responders?.some(responder => responder.userId === viewerSpaceId)) return undefined;
    return new Map([
      [
        viewerSpaceId,
        {
          avatarUrl: viewerProfile?.avatarUrl ?? null,
          address: viewerProfile?.address ?? walletAddress ?? null,
        },
      ],
    ]);
  }, [responders, viewerAdded, viewerProfile, viewerSpaceId, walletAddress]);

  if (responderSpaceIds.length === 0) return null;

  return (
    <RankingAggregatedSubmitterAvatars
      submitterSpaceIds={responderSpaceIds}
      totalCount={Math.max(totalResponders, responderSpaceIds.length)}
      size={12}
      queriesEnabled={!responseBatch.managed}
      knownProfiles={knownProfiles}
    />
  );
}

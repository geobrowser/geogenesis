'use client';

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';

import {
  type ClaimResponseTarget,
  claimResponseSummariesQueryKeyPrefix,
  claimResponseSummaryResponderSpaceIds,
  claimResponseTargetKey,
  loadClaimResponderMetadataCaches,
  loadClaimResponseSummaryCaches,
  normalizeClaimResponseTargets,
} from './claim-response-summaries';

const ClaimResponseBatchContext = React.createContext({ managed: false, ready: true });

export function ClaimResponseBatchBoundary({ ready, children }: { ready: boolean; children: React.ReactNode }) {
  const value = React.useMemo(() => ({ managed: true, ready }), [ready]);
  return React.createElement(ClaimResponseBatchContext.Provider, { value }, children);
}

export function useClaimResponseBatchState() {
  return React.useContext(ClaimResponseBatchContext);
}

export function useClaimResponseSummaryBatch({
  spaceId,
  targets,
  enabled,
}: {
  spaceId: string;
  targets: ClaimResponseTarget[];
  enabled: boolean;
}) {
  const queryClient = useQueryClient();
  const { personalSpaceId, isLoading: isPersonalSpaceLoading } = usePersonalSpaceId();
  const normalizedTargets = normalizeClaimResponseTargets(targets);

  const responseBatch = useQuery({
    queryKey: [
      ...claimResponseSummariesQueryKeyPrefix(personalSpaceId, spaceId),
      normalizedTargets.map(claimResponseTargetKey),
    ],
    queryFn: ({ signal }) =>
      loadClaimResponseSummaryCaches({
        queryClient,
        spaceId,
        targets: normalizedTargets,
        personalSpaceId,
        signal,
      }),
    enabled: enabled && !isPersonalSpaceLoading && normalizedTargets.length > 0,
    staleTime: 30_000,
    retry: 2,
    // GEO-2599: the query key contains the whole target list, so adding a claim —
    // or any local-store update while typing, since the claims page passes
    // `includeUnpublishedLocal` — mints a NEW key. React Query then has no data for
    // it, `isSuccess` drops to false, and `ClaimResponseBatchBoundary` (which gates
    // on exactly that) hides every position until the refetch lands. `staleTime`
    // cannot help: it only applies within one key.
    //
    // That is what "I just lost all of Dovile's positions without doing anything
    // whilst I was typing" was. Invisible on a fast connection, where the gap is
    // milliseconds; most of a minute on a slow one.
    //
    // Serving the previous key's data through the transition keeps known positions
    // on screen while the new set loads. Safe because positions are additive and
    // `spaceId` + `personalSpaceId` are in the key prefix, so it can never show a
    // different space's data.
    placeholderData: keepPreviousData,
  });
  const responderSpaceIds = responseBatch.data ? claimResponseSummaryResponderSpaceIds(responseBatch.data) : [];

  useQuery({
    queryKey: [
      'claim-response-responder-metadata',
      spaceId,
      normalizedTargets.map(claimResponseTargetKey),
      responderSpaceIds,
    ],
    queryFn: ({ signal }) =>
      loadClaimResponderMetadataCaches({
        queryClient,
        spaceId,
        targets: normalizedTargets,
        summaries: responseBatch.data!,
        signal,
      }),
    enabled: responseBatch.isSuccess && responderSpaceIds.length > 0,
    staleTime: 60_000,
    retry: 2,
  });

  return responseBatch;
}

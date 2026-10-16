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

  const batchEnabled = enabled && !isPersonalSpaceLoading && normalizedTargets.length > 0;

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
    enabled: batchEnabled,
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
  /*
   * Asks again for a batch fetch a vote cancelled.
   *
   * A vote's read-back cancels every batch in its space (`use-entity-vote`), so a batch still in
   * flight can't land after it with the pre-vote numbers, then refreshes only the claim voted on. A
   * cancelled fetch goes back to whatever it had before — nothing, on a first fetch; the old answer,
   * on a refresh — idle, and nothing asks again: its key hasn't changed, and a query doesn't refetch
   * for being stale. Every other claim in it would stay unseeded, or stay at the numbers the refresh
   * was replacing, for as long as the page is open.
   *
   * A fetch is known to have been cancelled when it goes idle having neither answered nor failed:
   * both of those stamp the query, and a cancellation puts back the stamps it started with. Keyed
   * on the target list, since a new list is a different query and its fetch a different fetch.
   */
  const batchKey = JSON.stringify([personalSpaceId, spaceId, normalizedTargets.map(claimResponseTargetKey)]);
  const inFlight = React.useRef<{ key: string; dataUpdatedAt: number; errorUpdatedAt: number } | null>(null);
  const askAgain = React.useEffectEvent(() => void responseBatch.refetch());
  const { fetchStatus, dataUpdatedAt, errorUpdatedAt } = responseBatch;
  React.useEffect(() => {
    if (fetchStatus === 'fetching') {
      if (inFlight.current?.key !== batchKey) inFlight.current = { key: batchKey, dataUpdatedAt, errorUpdatedAt };
      return;
    }
    // Paused for the network is still in flight.
    if (fetchStatus === 'paused') return;
    const fetch = inFlight.current;
    inFlight.current = null;
    if (!fetch || fetch.key !== batchKey || !batchEnabled) return;
    const cancelled = dataUpdatedAt === fetch.dataUpdatedAt && errorUpdatedAt === fetch.errorUpdatedAt;
    if (cancelled) askAgain();
  }, [batchEnabled, batchKey, dataUpdatedAt, errorUpdatedAt, fetchStatus]);

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

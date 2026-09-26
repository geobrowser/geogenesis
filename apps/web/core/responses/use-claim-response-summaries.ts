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
   * Asks again for a batch a vote cancelled before it ever answered.
   *
   * A vote's read-back cancels every batch in its space (`use-entity-vote`), so a batch still in
   * flight can't land after it with the pre-vote numbers. It then refreshes only the claim voted on.
   * A batch that had answered before goes back to that answer; one cancelled on its first fetch goes
   * back to having none, idle, and nothing asks again — its key hasn't changed and it isn't stale
   * enough to matter. Every other claim in it would stay unseeded for as long as the page is open.
   * `isFetched` rather than `data`, since a new target list shows the previous list's answer as a
   * placeholder while its own first fetch runs.
   */
  const wasFetching = React.useRef(false);
  const askAgain = React.useEffectEvent(() => void responseBatch.refetch());
  React.useEffect(() => {
    const cancelledBeforeAnswering =
      wasFetching.current && responseBatch.fetchStatus === 'idle' && !responseBatch.isFetched;
    wasFetching.current = responseBatch.fetchStatus === 'fetching';
    if (cancelledBeforeAnswering && batchEnabled) askAgain();
  }, [batchEnabled, responseBatch.fetchStatus, responseBatch.isFetched]);

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

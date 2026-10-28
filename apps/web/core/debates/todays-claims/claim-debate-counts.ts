'use client';

import { useQueries } from '@tanstack/react-query';

import * as React from 'react';

import { normId } from '~/core/utils/norm-id';

import { CLAIM_DEBATE_COUNTS_MAX_CLAIMS, type ClaimDebateCountsResponse, getClaimDebateCounts } from '../api';
import { debateQueryKeys, debateQueryNetworkOptions, stableClaimIdChunks, useGeoChatAuth } from '../hooks';

export type ClaimDebateCountAsk = { claimId: string; since: string };

/**
 * GEO-3489. Each claim's recorded debates since it was listed, from geo-chat.
 *
 * Fetched once and never refreshed: Today's claims sets its order when the picker opens and holds it
 * there, so a newer count would only be a reason to move a card under someone's cursor.
 *
 * Batched by `stableClaimIdChunks`, like the rematch rows, so a claim joining the list re-asks only
 * the batch it lands in. Keyed by account like them too: geo-chat needs a signed-in caller, so the
 * request waits for Privy to restore the session, and reports that wait as loading — a disabled
 * query reads as settled, and the order would be set without the counts it is made from.
 *
 * `byClaimId` is null until every batch has answered or one has failed. A caller that cannot get the
 * counts lists the agenda in its own order, which is the order an agenda nobody has debated yet has
 * anyway.
 */
export function useClaimDebateCounts(asks: ClaimDebateCountAsk[], enabled = true) {
  const { ready, accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  // Ready and signed out is an answer (no counts); not ready yet is not.
  const waitingForAccount = enabled && asks.length > 0 && !ready;

  const batches = React.useMemo(() => {
    const sinceByClaim = new Map(asks.map(ask => [ask.claimId, ask.since]));
    return stableClaimIdChunks([...sinceByClaim.keys()], CLAIM_DEBATE_COUNTS_MAX_CLAIMS).map(chunk =>
      chunk.map(claimId => ({ claimId, since: sinceByClaim.get(claimId)! }))
    );
  }, [asks]);

  const combine = React.useCallback(
    (results: { data?: ClaimDebateCountsResponse; isLoading: boolean; error: unknown }[]) => {
      const error = results.find(result => result.error)?.error ?? null;
      const isLoading = waitingForAccount || results.some(result => result.isLoading);
      if (error || isLoading) return { byClaimId: null, isLoading, error };
      const byClaimId = new Map<string, number>();
      for (const result of results) {
        for (const count of result.data?.counts ?? []) byClaimId.set(normId(count.claim_entity_id), count.debates);
      }
      return { byClaimId, isLoading, error };
    },
    [waitingForAccount]
  );

  return useQueries({
    queries: batches.map(batch => ({
      ...debateQueryNetworkOptions,
      queryKey: debateQueryKeys.claimDebateCounts(accountKey, batch),
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        getClaimDebateCounts(
          batch.map(ask => ({ claim_entity_id: ask.claimId, since: ask.since })),
          getPrivyIdentityToken,
          accountKey,
          signal
        ),
      staleTime: Infinity,
      enabled: enabled && accountKey !== null,
    })),
    combine,
  });
}

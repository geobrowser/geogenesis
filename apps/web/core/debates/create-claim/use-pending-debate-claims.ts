'use client';

import { useQueries, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { useAtom } from 'jotai';

import type { ClaimDraftSelection } from '~/core/claims/claim-draft';
import { fetchClaimPickerEntities } from '~/core/debates/claim-picker-page';
import { debateQueryKeys, useGeoChatAuth } from '~/core/debates/hooks';

import { pendingDebateClaimsAtom } from '~/atoms/debate-create-claim';

/** How often the graph is polled for a just-published claim, until it resolves. */
const INDEXING_POLL_INTERVAL_MS = 4_000;

const INDEXED_DISMISS_GRACE_MS = 12_000;

/**
 * The inline-created claims that have not yet indexed, and the controls to manage them.
 *
 * Also runs the indexing watch: each still-`publishing` claim is polled on the graph (the same
 * projection the rematch picker reads) and flipped to `indexed` the first time it resolves. React
 * Query dedupes by key, so mounting this hook from more than one place on a page polls each claim
 * once, not once per caller.
 *
 * A claim stays in the list after it indexes — the caller keeps showing it selected until the real
 * list it belongs to has caught up and taken over — and is removed by `dismissPendingClaim`. If the
 * filtered list never includes it, a grace timeout dismisses it after indexing so it cannot stick.
 */
export function usePendingDebateClaims() {
  const queryClient = useQueryClient();
  const { accountKey } = useGeoChatAuth();
  const [pendingClaims, setPendingClaims] = useAtom(pendingDebateClaimsAtom);
  // Which claims this hook has already reacted to indexing for, so the invalidation below fires once
  // per claim rather than on every poll after it resolves.
  const flipped = React.useRef(new Set<string>());
  const indexedDismissTimers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const addPendingClaim = React.useCallback(
    (claim: { claimId: string; spaceId: string; text: string; topics: ClaimDraftSelection[] }) => {
      setPendingClaims(current => {
        if (current.some(existing => existing.claimId === claim.claimId)) return current;
        return [...current, { ...claim, status: 'publishing' as const }];
      });
    },
    [setPendingClaims]
  );

  const dismissPendingClaim = React.useCallback(
    (claimId: string) => {
      const timer = indexedDismissTimers.current.get(claimId);
      if (timer) {
        clearTimeout(timer);
        indexedDismissTimers.current.delete(claimId);
      }
      setPendingClaims(current => current.filter(claim => claim.claimId !== claimId));
    },
    [setPendingClaims]
  );

  const markIndexed = React.useCallback(
    (claimId: string) =>
      setPendingClaims(current =>
        current.map(claim => (claim.claimId === claimId ? { ...claim, status: 'indexed' as const } : claim))
      ),
    [setPendingClaims]
  );

  const watching = React.useMemo(() => pendingClaims.filter(claim => claim.status === 'publishing'), [pendingClaims]);

  const indexingResults = useQueries({
    queries: watching.map(claim => ({
      queryKey: ['debate-create-claim', 'indexing', claim.claimId] as const,
      queryFn: async ({ signal }: { signal?: AbortSignal }) => {
        const entities = await fetchClaimPickerEntities([claim.claimId], signal);
        // Resolved as a Claim in the graph — the query filters on the Claim type — means the debates
        // lists can see it now. Report the id so the effect below can flip it.
        return entities.length > 0 ? claim.claimId : null;
      },
      // Poll until it resolves; once found the row leaves `watching` and the query unmounts.
      refetchInterval: INDEXING_POLL_INTERVAL_MS,
      staleTime: 0,
    })),
  });

  React.useEffect(() => {
    for (const result of indexingResults) {
      const claimId = result.data;
      if (!claimId || flipped.current.has(claimId)) continue;
      flipped.current.add(claimId);
      markIndexed(claimId);
      // Graph-sourced lists read `['tagged-claims', …]`; mine / debate_now read matchmaking-claims.
      void queryClient.invalidateQueries({ queryKey: ['tagged-claims'] });
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.matchmakingClaimsRoot(accountKey) });
    }
  }, [accountKey, indexingResults, markIndexed, queryClient]);

  // Grace-dismiss indexed cards the filtered list never absorbs. Driven off `pendingClaims` status
  // rather than the flip moment
  React.useEffect(() => {
    const timers = indexedDismissTimers.current;
    const pendingIds = new Set(pendingClaims.map(claim => claim.claimId));

    for (const claim of pendingClaims) {
      if (claim.status !== 'indexed') continue;
      if (timers.has(claim.claimId)) continue;
      timers.set(
        claim.claimId,
        setTimeout(() => {
          timers.delete(claim.claimId);
          dismissPendingClaim(claim.claimId);
        }, INDEXED_DISMISS_GRACE_MS)
      );
    }

    for (const [claimId, timer] of timers) {
      if (pendingIds.has(claimId)) continue;
      clearTimeout(timer);
      timers.delete(claimId);
    }
  }, [dismissPendingClaim, pendingClaims]);

  React.useEffect(() => {
    const timers = indexedDismissTimers.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  return { pendingClaims, addPendingClaim, dismissPendingClaim };
}

import type { QueryClient, QueryFilters } from '@tanstack/react-query';

/**
 * Whether a query key names a session's rematch claims — the batches the picker asks geo-chat for,
 * `['debates','account',accountKey,'rematch',sessionId,'claims',ids]`, and the id-less prefix
 * `[...,'claims']` that covers every batch of a session. Both forms are matched: the predicate
 * stops at the `'claims'` segment, so a filter written as the prefix is recognised as well.
 *
 * These carry the session's flags and the viewer's readiness for each claim. They are the most
 * expensive family under `'debates'` — a request per page of claims on screen — and almost nothing
 * that invalidates the root actually changes them. Kept in its own module so the gateway and the
 * hooks can both read it without importing each other.
 */
export function isRematchClaimsQueryKey(queryKey: readonly unknown[]) {
  return (
    queryKey[0] === 'debates' && queryKey[1] === 'account' && queryKey[3] === 'rematch' && queryKey[5] === 'claims'
  );
}

/**
 * Filters for the rematch claim batches that carry `claimId` — plus the id-less session list,
 * which any response can add a row to. The batches that don't name the claim learned nothing.
 */
export function rematchClaimBatchesWithClaim(accountKey: string | null, claimId: string, sessionId?: string) {
  return {
    predicate: (query: { queryKey: readonly unknown[] }) => {
      const { queryKey } = query;
      if (!isRematchClaimsQueryKey(queryKey) || queryKey[2] !== accountKey) return false;
      if (sessionId !== undefined && queryKey[4] !== sessionId) return false;
      const ids = queryKey[6];
      return !Array.isArray(ids) || ids.length === 0 || ids.includes(claimId);
    },
  };
}

/**
 * Refresh rematch claim batches without restarting a request that is about to land.
 *
 * Invalidating cancels an in-flight fetch by default, which throws away a request that was about
 * to answer — and when changes arrive faster than the round trips complete, means none of them
 * ever land. A batch in flight is left to land, since its answer is still worth putting on screen,
 * and is then asked again so what the viewer ends up looking at postdates the change that prompted
 * this. The gateway does the same on its own flushes; these are the same batches.
 */
export function refreshRematchClaimBatches(queryClient: QueryClient, filters: QueryFilters) {
  const inFlight = queryClient.getQueryCache().findAll({ ...filters, fetchStatus: 'fetching' });
  const refreshed = queryClient.invalidateQueries(filters, { cancelRefetch: false });
  if (inFlight.length === 0) return refreshed;

  return refreshed.finally(() =>
    queryClient.refetchQueries(
      { type: 'active', predicate: query => inFlight.some(batch => batch.queryHash === query.queryHash) },
      { cancelRefetch: false }
    )
  );
}

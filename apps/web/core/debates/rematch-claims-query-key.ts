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

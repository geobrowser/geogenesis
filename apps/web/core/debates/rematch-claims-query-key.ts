/**
 * Whether a query key is one of the rematch picker's positions lookups —
 * `['debates','account',accountKey,'rematch',sessionId,'claims',ids]`.
 *
 * These are the most expensive family under `'debates'`: a request per page of claims on screen,
 * and almost nothing that invalidates the root actually changes them. Kept in its own module so
 * the gateway and the hooks can both read it without importing each other.
 */
export function isRematchClaimsQueryKey(queryKey: readonly unknown[]) {
  return (
    queryKey[0] === 'debates' && queryKey[1] === 'account' && queryKey[3] === 'rematch' && queryKey[5] === 'claims'
  );
}

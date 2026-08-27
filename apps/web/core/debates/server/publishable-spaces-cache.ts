/**
 * Last-known-good cache for the acceptor's editor spaces.
 *
 * This exists because of how the previous caching failed, which is worth stating precisely. The
 * route carried `export const revalidate = 300`, so whatever it returned was cached — *including*
 * the `{ spaceIds: null }` it returns when the lookup fails. `null` means "unknown", and both
 * client-side gates read unknown as "do not filter". So a single upstream 503 was baked into the
 * response cache, and every viewer served that entry saw claims from every space they could see
 * rather than the six the acceptor edits. Observed in production: one logged 503 at 15:54, and the
 * endpoint still answering `null` when sampled hours later.
 *
 * Segment-level revalidation cannot express "cache successes, never cache failures" — it caches the
 * response, not the outcome. So the route is dynamic now and the TTL lives here, where a failure can
 * be handled on its own terms: serve the last good answer instead.
 *
 * Serving a stale-but-real list beats serving `null`. A space the acceptor stopped editing lingers
 * for at most one TTL, which offers one dead-end claim; `null` drops the filter entirely. Wrong in
 * the narrow direction beats wrong in the wide one.
 *
 * Per-instance and best-effort by nature — serverless instances are ephemeral and there are many, so
 * a cold instance has no last-good value and correctly falls through to `null`. That is a smaller
 * window than the one this replaces, not a guarantee.
 */

export type PublishableSpacesCacheEntry = {
  spaceIds: string[];
  storedAtMs: number;
};

/** Editor sets change when someone is added to a space, which is rare. */
export const PUBLISHABLE_SPACES_TTL_MS = 5 * 60_000;

/**
 * How long a last-known-good list may be served *after* a failed refresh.
 *
 * Deliberately much longer than the TTL. The TTL decides when to try again; this decides how long
 * a real answer stays better than no answer, and an editor set that changed an hour ago is still a
 * far better filter than none. Bounded rather than unbounded so a permanently broken upstream
 * eventually surfaces as unknown instead of pinning a stale list forever.
 */
export const PUBLISHABLE_SPACES_STALE_LIMIT_MS = 6 * 60 * 60_000;

export function isFresh(entry: PublishableSpacesCacheEntry | null, nowMs: number): boolean {
  if (!entry) return false;
  return nowMs - entry.storedAtMs < PUBLISHABLE_SPACES_TTL_MS;
}

export function isServableWhenStale(entry: PublishableSpacesCacheEntry | null, nowMs: number): boolean {
  if (!entry) return false;
  return nowMs - entry.storedAtMs < PUBLISHABLE_SPACES_STALE_LIMIT_MS;
}

/**
 * What to return, given the cache and whether the refresh succeeded.
 *
 * Split out as a pure function because the interesting behaviour is the failure path, and that is
 * the one hardest to exercise through a route handler.
 */
export function resolvePublishableSpaces(args: {
  entry: PublishableSpacesCacheEntry | null;
  refreshed: string[] | null;
  nowMs: number;
}): { spaceIds: string[] | null; cacheable: boolean } {
  if (args.refreshed) {
    return { spaceIds: args.refreshed, cacheable: true };
  }
  // Refresh failed. A real list from a moment ago is a better filter than no filter at all.
  if (isServableWhenStale(args.entry, args.nowMs)) {
    return { spaceIds: args.entry!.spaceIds, cacheable: false };
  }
  return { spaceIds: null, cacheable: false };
}

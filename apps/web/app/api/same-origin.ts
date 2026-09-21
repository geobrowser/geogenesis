/**
 * Whether a request came from our own pages.
 *
 * Shared for the same reason `client-ip.ts` is: eleven chat routes and `ranking-og/route-utils`
 * each carried a copy, and the places routes needed a thirteenth.
 *
 * It is worth being clear about what this does and does not buy. A browser sets `Origin` itself
 * and a page cannot forge it, so this stops other sites driving these endpoints from a visitor's
 * browser. It stops nothing scripted: curl sets whatever `Origin` it likes. On an endpoint that
 * spends money or writes somewhere, the rate limit is the control that matters and this is the
 * cheap first filter.
 *
 * A missing `Origin` is allowed outside production because browsers omit it on same-origin GETs
 * per the Fetch spec, and server-side callers in development have none.
 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  if (!origin) return process.env.NODE_ENV !== 'production';
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

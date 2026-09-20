/**
 * The calling client's IP, as a rate-limit bucket key.
 *
 * Shared because it was not: eleven chat routes and `ranking-og/rate-limit.ts` each carry their own
 * copy of this, and the newsletter route made a thirteenth before this file existed. They had
 * already drifted — chat's `forwarded.split(',')[0].trim()` can yield an empty string for a
 * malformed header and bucket every such caller together, which ranking-og's guards against. This
 * takes the safer half of each.
 *
 * The fallback is stable on purpose, and this is the part worth reading. The eleven chat copies end
 * `return \`noip:${crypto.randomUUID()}\`` — which reads like "a bucket per unidentified caller"
 * but is really a bucket per *request*, since nothing about a UUID minted here survives the
 * response. A counter that starts at zero every time never reaches its limit, so any caller who can
 * suppress both headers has no rate limit at all. That is a fair trade for chat, which is behind a
 * wallet and whose comment says this path is local dev only. It is not one here: this endpoint
 * writes into someone else's mailing list for anonymous callers, and it is the single thing on it
 * most worth protecting.
 *
 * So unidentified callers share one bucket, as `ranking-og` already has them do. The cost is that
 * they can spend each other's budget — but off a proxy the only callers are developers on one
 * machine, because Vercel sets `x-forwarded-for` itself and overwrites whatever the client sent. In
 * production this branch does not run; in development a shared bucket is the right kind of wrong.
 */
const UNIDENTIFIED_CALLER = 'noip:shared';

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    // First entry is the original client; the rest are proxies it passed through.
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }

  const real = request.headers.get('x-real-ip')?.trim();
  if (real) return real;

  return UNIDENTIFIED_CALLER;
}

/**
 * The calling client's IP, as a rate-limit bucket key.
 *
 * Shared because it was not: eleven chat routes and `ranking-og/rate-limit.ts` each carry their own
 * copy of this, and the newsletter route made a thirteenth before this file existed. They had
 * already drifted — chat's `forwarded.split(',')[0].trim()` can yield an empty string for a
 * malformed header and bucket every such caller together, which ranking-og's guards against. This
 * takes the safer half of each.
 *
 * `noip:` is chat's behaviour and the majority one: with no proxy headers at all, every caller gets
 * a bucket of their own rather than sharing one. That only happens off a proxy — on Vercel the
 * platform sets `x-forwarded-for` and overwrites what the client sent — so in practice this is the
 * local-dev path, and a shared bucket there would have one developer's requests rate-limiting
 * another's. `ranking-og` deliberately differs, falling back to a shared `'unknown'`: it fails open
 * by design, so its buckets are advisory. Left as it is rather than quietly changed.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    // First entry is the original client; the rest are proxies it passed through.
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }

  const real = request.headers.get('x-real-ip')?.trim();
  if (real) return real;

  return `noip:${crypto.randomUUID()}`;
}

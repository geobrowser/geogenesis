import { createPromiseTtlCache } from '~/core/utils/promise-ttl-cache';

/**
 * Direct stills for the lead card, in place of geo-chat's redirecting content route.
 *
 * A still's durable URL answers `302` with `Cache-Control: no-store` to a fresh presigned R2 GET, and
 * that hop (about 0.35s, 0.2s of it TLS to a second origin) sits in front of the page's largest
 * paint. The server follows it once, here, and hands the browser the R2 URL itself.
 *
 * geo-chat signs the redirect for six hours (`MEDIA_CONTENT_PRESIGN_EXPIRES`) from the moment of the
 * request, and states both the start (`X-Amz-Date`) and the lifetime (`X-Amz-Expires`) in the URL,
 * so the remaining validity is read off the URL rather than assumed. The URL then sits in the public
 * feed's CDN copy (`s-maxage=60`, `stale-while-revalidate=600`, so up to 11 min) and the browser's
 * feed cache, and in the cache below for up to `RESOLUTION_TTL_MS`. A URL is only used if it has
 * `MIN_REMAINING_MS` left, which is more than all of those added up.
 *
 * A tab left open past the signature, and the last good page (served for up to a day when gaia
 * cannot build one), can still hold an expired URL; the card falls back to the durable route when
 * the image errors.
 */

/** Bounds the server-side hop; a slower geo-chat answers with the durable URL and the page goes on. */
export const RESOLVE_TIMEOUT_MS = 600;

/** How long one resolution is reused. Short against the signature, long against a feed rebuild. */
const RESOLUTION_TTL_MS = 30 * 60 * 1000;

/** Fresh-signature floor at resolution (of six hours); a cached copy is used down to this less `RESOLUTION_TTL_MS`. */
export const MIN_REMAINING_MS = 5 * 60 * 60 * 1000;

const resolutions = createPromiseTtlCache<string>({ ttlMs: RESOLUTION_TTL_MS, maxEntries: 64 });

/** Milliseconds a presigned URL stays valid from `nowMs`, or null when it does not say. */
export function presignedRemainingMs(url: string, nowMs: number): number | null {
  let params: URLSearchParams;
  try {
    params = new URL(url).searchParams;
  } catch {
    return null;
  }
  const date = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(params.get('X-Amz-Date') ?? '');
  const expiresSec = Number(params.get('X-Amz-Expires'));
  if (!date || !Number.isFinite(expiresSec) || expiresSec <= 0) return null;
  const [, y, mo, d, h, mi, s] = date;
  const signedAtMs = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  return signedAtMs + expiresSec * 1000 - nowMs;
}

async function followOnce(url: string, nowMs: () => number, fetchImpl: typeof fetch): Promise<string> {
  const response = await fetchImpl(url, {
    redirect: 'manual',
    cache: 'no-store',
    signal: AbortSignal.timeout(RESOLVE_TIMEOUT_MS),
  });
  const location = response.status === 302 ? response.headers.get('location') : null;
  if (!location) throw new Error(`still did not redirect: ${response.status}`);
  const target = new URL(location, url);
  const remaining = presignedRemainingMs(target.href, nowMs());
  if (target.protocol !== 'https:' || remaining === null || remaining < MIN_REMAINING_MS) {
    throw new Error('still redirect is not a fresh presigned https URL');
  }
  return target.href;
}

/**
 * The URL the browser should load for a still: the presigned target of the durable route when it
 * can be had quickly and has plenty of life left, the durable URL otherwise. Never throws.
 */
export async function resolveStillUrl(
  url: string,
  { fetchImpl = fetch, nowMs = Date.now }: { fetchImpl?: typeof fetch; nowMs?: () => number } = {}
): Promise<string> {
  try {
    // A failure is thrown out of the cache, which drops it, so a bad moment is not kept for 30 min.
    const direct = await resolutions.get(url, () => followOnce(url, nowMs, fetchImpl));
    const remaining = presignedRemainingMs(direct, nowMs());
    return remaining !== null && remaining >= MIN_REMAINING_MS - RESOLUTION_TTL_MS ? direct : url;
  } catch {
    return url;
  }
}

export function resetStillResolutionsForTests() {
  resolutions.clear();
}

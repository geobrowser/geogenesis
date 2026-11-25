import { NextResponse } from 'next/server';

import { geoChatBaseUrl } from '~/core/debates/server/geo-chat-base-url';
import { resolveStillUrl } from '~/core/explore/resolve-still-redirect';
import { validateSpaceId } from '~/core/io/rest/validation';

export const runtime = 'nodejs';

/** Cached redirect to a fresh presigned R2 still (presigned for 6h on geo-chat). */
const FOUND_CACHE = 'public, max-age=1800, s-maxage=1800';
/** Debate has no still for this slot yet; re-check after a short window. */
const NO_STILL_CACHE = 'public, max-age=300, s-maxage=300';
const FETCH_TIMEOUT_MS = 4000;

/**
 * GET /api/debates/still/<debateId>/<1|2>
 *
 * Resolves a debate speaker video still server-side via `GEO_CHAT_API_BASE_URL` and redirects the
 * browser directly to the presigned R2 object URL. Works identically in production and local dev
 * even when `NEXT_PUBLIC_GEO_CHAT_API_BASE_URL` is a relative proxy path.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ debateId: string; slot: string }> }
): Promise<Response> {
  const { debateId, slot } = await params;
  const canonicalId = validateSpaceId(debateId);
  if (!canonicalId || canonicalId !== debateId.toLowerCase() || (slot !== '1' && slot !== '2')) {
    return new Response('Not found', { status: 404 });
  }

  const base = geoChatBaseUrl();
  if (!base.startsWith('http://') && !base.startsWith('https://')) {
    return new Response('Still upstream unconfigured', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  const upstream = `${base}/debates/${encodeURIComponent(canonicalId)}/media/artifacts/speaker_still_slot_${slot}/content`;

  // Fast path: reuse the 30-minute presigned URL resolution cache.
  const cachedDirect = await resolveStillUrl(upstream);
  if (cachedDirect !== upstream && cachedDirect.startsWith('https://')) {
    return NextResponse.redirect(cachedDirect, {
      status: 302,
      headers: { 'Cache-Control': FOUND_CACHE },
    });
  }

  // Fallback for cold-start requests that took longer than `resolveStillUrl`'s 600ms budget.
  try {
    const res = await fetch(upstream, {
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const location = res.status === 302 ? res.headers.get('location') : null;
    await res.body?.cancel();
    if (location && location.startsWith('https://')) {
      return NextResponse.redirect(location, {
        status: 302,
        headers: { 'Cache-Control': FOUND_CACHE },
      });
    }
    if (res.status === 404) {
      return new Response('Not found', { status: 404, headers: { 'Cache-Control': NO_STILL_CACHE } });
    }
    return new Response('Upstream error', { status: 502, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return new Response('Upstream timeout', { status: 504, headers: { 'Cache-Control': 'no-store' } });
  }
}

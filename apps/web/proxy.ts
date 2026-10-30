import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { debateRecordingFromPath } from '~/core/debates/recording-routes';
import { expandShareLink } from '~/core/sharing/share-link';
import { isPossibleSpacePath, isValidId } from '~/core/utils/space-url';

/**
 * Rejects structurally impossible `/space/...` URLs with a real 404.
 *
 * Named `proxy` per Next 16 — the `middleware` file convention is deprecated.
 *
 * See `core/utils/space-url.ts` for why this cannot live in the page: the entity
 * route streams, so `notFound()` there arrives after the 200 is already
 * committed and the not-found UI is served with a success status. Crawlers only
 * drop a URL on a genuine 404, so every malformed URL stayed alive and was
 * re-crawled indefinitely, each time paying a full uncached serverless render.
 *
 * Rewriting to `/_not-found` rather than returning a bare 404 body keeps the
 * normal styled 404 page, so a human who mistypes a URL sees the same thing they
 * always did — only the status line changes.
 *
 * ---
 *
 * The 404 is correct but it was not cheap, which was the point of returning it.
 * `/space/[id]` traffic measured over 24h:
 *
 *     real page views (analytics, internal excluded)   ~1,245/day
 *     /_not-found                                     ~14,739/day
 *
 * Twelve rejected URLs for every page a person looked at, essentially all of
 * them pre-migration `0x…` and base58 ids that a crawler is still working
 * through. Each one rewrote to `/_not-found`, which invoked the serverless
 * function and shipped a ~49KB styled document to something that was never
 * going to read it — about 730MB a day of 404 bodies.
 *
 * Repeats were not the problem: an identical URL edge-caches (verified
 * MISS then HIT). The cost is that each URL is *distinct*, so the cache never
 * helps and every one is a fresh render.
 *
 * So the styled page is now reserved for the case it was written for — a person
 * who mistyped — and everything else gets a bare 404 straight from the edge,
 * with no page render at all. This does not depend on the client respecting
 * anything, which is the reason it is here rather than in `robots.txt`; as that
 * file's own comment says, the crawlers that honour robots were never the whole
 * problem.
 */
export default function proxy(request: NextRequest): NextResponse | Promise<NextResponse> {
  const shared = expandShareLink(request.url);
  if (shared) return NextResponse.redirect(shared, 307);
  // The matcher only sends `/debate` here for a short share code; a code that does not parse opens
  // the room as it is.
  if (request.nextUrl.pathname.startsWith('/debate/')) return NextResponse.next();

  const recording = debateRecordingFromPath(request.nextUrl.pathname);
  // A recording link's debate id is checked like the space's: one that cannot exist is rejected as
  // cheaply as any other impossible URL, rather than costing a graph round-trip.
  const possible = isPossibleSpacePath(request.nextUrl.pathname) && (!recording || isValidId(recording.debateId));

  if (possible) {
    return recording ? openPublishedDebate(request, recording.spaceId, recording.debateId) : NextResponse.next();
  }

  if (!isBrowserNavigation(request)) {
    return bareNotFound(request.method);
  }

  return NextResponse.rewrite(new URL('/_not-found', request.url), { status: 404 });
}

/**
 * A debate's recording link opens the debate's own page once the debate is on the graph (GEO-3435),
 * as a real 307 here: the recording route streams, so a redirect from the page would only arrive
 * after "Loading the recording…" had painted (the same reason the 404s above live here). Until it's
 * published, or if the graph can't be reached, the recording page renders as before. Only recording
 * links pay for the graph lookup; every other `/space` URL stays synchronous.
 */
async function openPublishedDebate(request: NextRequest, spaceId: string, debateId: string): Promise<NextResponse> {
  let debatePage: string | null;
  try {
    // Loaded on demand: the graph client brings the SDK, viem and app config (which throws on a
    // missing env var) with it, and must not load for every /space request. See `space-url.ts`.
    // A failure to load falls back to the recording page like any other, rather than failing it.
    const { publishedDebatePath } = await import('~/core/debates/server/published-debate-path');
    debatePage = await publishedDebatePath(spaceId, debateId, request.nextUrl.searchParams);
  } catch {
    debatePage = null;
  }
  return debatePage ? NextResponse.redirect(new URL(debatePage, request.url), 307) : NextResponse.next();
}

/**
 * Whether this request is a person navigating, as opposed to a crawler, a link
 * checker or a preview unfurler.
 *
 * `Sec-Fetch-Mode: navigate` is the signal because every browser that can reach
 * this sends it on a top-level navigation and crawlers essentially never do —
 * including the ones that send a browser-shaped `Accept: text/html`, which is
 * why `Accept` cannot be used for this and a User-Agent allowlist would be a
 * treadmill.
 *
 * Deliberately requiring the header rather than treating its absence as human:
 * a browser old enough not to send it (pre-2019 Chrome, Safari before 16.4)
 * gets a plain 404 instead of the styled one. That is the whole cost, it only
 * applies to a URL that cannot exist, and these ids were retired before those
 * browsers went out of support.
 */
function isBrowserNavigation(request: NextRequest): boolean {
  return request.method === 'GET' && request.headers.get('sec-fetch-mode') === 'navigate';
}

/**
 * A 404 with no page render. HEAD gets no body at all, which is what HEAD means
 * and also what most of the link-checker traffic here is asking for.
 *
 * Cached because a structurally impossible id cannot become possible later —
 * the formats are retired, so there is no revalidation worth paying for. It
 * only helps where a URL repeats, but it costs nothing where one does not.
 */
function bareNotFound(method: string): NextResponse {
  return new NextResponse(method === 'HEAD' ? null : 'Not Found', {
    status: 404,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}

export const config = {
  // Scoped to /space so no other route pays for this check. Excludes Next's own
  // asset paths, which never look like space URLs but would otherwise be matched
  // on every request.
  //
  // Lobby share links (`/debate/<id>?si=…`) come here only to expand their short share code
  // (GEO-3485): a share link is copied short, and the analytics runtime only reads the long `utm_*`
  // tags from the URL it lands on, so it is redirected to them before the page loads.
  matcher: ['/space/:path*', { source: '/debate/:path*', has: [{ type: 'query', key: 'si' }] }],
};

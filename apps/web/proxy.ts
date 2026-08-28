import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { isPossibleSpacePath } from '~/core/utils/space-url';

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
 */
export default function proxy(request: NextRequest) {
  if (isPossibleSpacePath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  return NextResponse.rewrite(new URL('/_not-found', request.url), { status: 404 });
}

export const config = {
  // Scoped to /space so no other route pays for this check. Excludes Next's own
  // asset paths, which never look like space URLs but would otherwise be matched
  // on every request.
  matcher: ['/space/:path*'],
};

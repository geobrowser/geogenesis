import { NextResponse } from 'next/server';

import type { ExploreFeedResult } from './fetch-explore-feed';

/**
 * The one answer every feed route gives when it could not build a feed.
 *
 * It exists because the three routes behind `EntityFeed` used to disagree: Explore answered 200
 * with an empty page, Topics answered 500, and activity answered 200. The 200s were the damaging
 * half — an empty page is the same bytes as a feed with nothing in it, so the surface printed
 * "No entities match these filters yet", blaming filters the reader never touched, and the client,
 * handed a success, never retried.
 *
 * 503 rather than 500: what fails here is almost always a dependency being shed under load — the
 * upstream graph, or the Featured-spaces traversal Explore's space scope is built from — and the
 * next attempt usually lands somewhere healthy. `EntityFeed` retries twice with backoff before it
 * tells the reader anything, which is what turns that into a feed rather than a message.
 *
 * The body keeps the `items`/`nextCursor` shape so a caller that reads it before checking the
 * status still sees something well-formed, and carries `error` so one that looks can say why.
 */
export function feedUnavailableResponse(): NextResponse<ExploreFeedResult & { error: string }> {
  return NextResponse.json({ items: [], nextCursor: null, error: 'feed_unavailable' }, { status: 503 });
}

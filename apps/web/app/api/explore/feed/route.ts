import { NextResponse } from 'next/server';

import { parseExploreSort, parseExploreTime } from '~/core/explore/explore-feed-params';
import { parseExploreTypeIdsParam } from '~/core/explore/explore-type-filter';
import { fetchExploreFeed } from '~/core/explore/fetch-explore-feed';
import { resolveExploreFeedRequestContext } from '~/core/explore/resolve-explore-feed-request-context';
import { normId } from '~/core/utils/norm-id';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sort = parseExploreSort(searchParams.get('sort'));
  const time = parseExploreTime(searchParams.get('time'));
  // A list since GEO-2789's explore half. `spaceId` is still read so an older client, or a link
  // someone kept, still narrows to the one space it names.
  const spaceIdsParam = searchParams.get('spaceIds') ?? searchParams.get('spaceId');
  const cursor = searchParams.get('cursor');
  const typeIds = parseExploreTypeIdsParam(searchParams.get('typeIds'));

  if (typeIds.length === 0) {
    return NextResponse.json({ items: [], nextCursor: null });
  }

  const { browse, memberOrEditorSpaceIds, walletAddress } = await resolveExploreFeedRequestContext();

  // Only spaces this reader may see, whatever they asked for. `all` and an empty parameter both
  // mean no narrowing; so does a list that matches nothing they can see, because a filter naming
  // only spaces they cannot see is a request we have no honest way to answer and an empty feed is
  // the wrong answer to it.
  let spaceFilter: string[] | null = null;
  if (spaceIdsParam && spaceIdsParam !== 'all') {
    const wanted = new Set(spaceIdsParam.split(',').map(normId).filter(Boolean));
    const visible = [...browse.featured, ...browse.editorOf, ...browse.memberOf]
      .filter(row => wanted.has(normId(row.id)))
      .map(row => row.id);
    if (visible.length > 0) spaceFilter = visible;
  }

  try {
    const result = await fetchExploreFeed({
      browse,
      sort,
      time,
      spaceFilterIds: spaceFilter,
      cursor,
      walletAddress,
      memberOrEditorSpaceIds,
      typeIds,
      requireName: true,
      // GEO-2835. A restriction on the feed rather than on the selection, unlike the types filter:
      // ticking Claim asks for the claims Explore has, and an untagged one is not among them.
      requireDebateTagOnClaims: true,
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error('explore feed', e);
    /**
     * A failure is reported as one. This used to answer 200 with an empty page so the UI still
     * mounted, but an empty page is the same bytes as a feed with nothing in it, and the client
     * prints "No entities match these filters yet" for it — an outage told the reader their own
     * filters were too narrow, and the client, seeing a success, never retried.
     *
     * A status the client can see is the better degradation: `useInfiniteQuery` retries twice with
     * backoff, which clears the common case here — a cold instance whose Featured-spaces traversal
     * was shed under load — and only then shows "Could not load the feed."
     */
    return NextResponse.json({ items: [], nextCursor: null, error: 'feed_unavailable' }, { status: 503 });
  }
}

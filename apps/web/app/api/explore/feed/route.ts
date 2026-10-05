import { NextResponse } from 'next/server';

import { browseSidebarVisibleSpaces } from '~/core/browse/fetch-browse-sidebar-data';
import { EXPLORE_EXCLUDED_TYPE_IDS } from '~/core/explore/explore-constants';
import { parseExplorePageSort, parseExploreTime } from '~/core/explore/explore-feed-params';
import { parseExploreTypeIdsParam } from '~/core/explore/explore-type-filter';
import { feedUnavailableResponse } from '~/core/explore/feed-route-response';
import { type ExploreSort, fetchExploreFeed } from '~/core/explore/fetch-explore-feed';
import { resolveExploreFeedRequestContext } from '~/core/explore/resolve-explore-feed-request-context';
import { normId } from '~/core/utils/norm-id';

/** Enough for any real follow list; the query string stays under ~7 KB. */
const MAX_FOLLOWED_TOPIC_IDS = 200;

/** Dashless 32-hex ids, deduplicated. Anything else is dropped rather than sent to the graph. */
function parseFollowedTopicIds(raw: string | null): string[] {
  if (!raw) return [];
  const ids = raw
    .split(',')
    .map(normId)
    .filter(id => /^[0-9a-f]{32}$/.test(id));
  return [...new Set(ids)].slice(0, MAX_FOLLOWED_TOPIC_IDS);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pageSort = parseExplorePageSort(searchParams.get('sort'));
  // GEO-3083. For you is Best plus the followed-topic stream, so with no followed topics it is
  // exactly Best: a signed-out reader or one who follows nothing never gets an empty feed. The
  // client sends the ids because its follow cache updates the moment a follow is written, where a
  // server read would trail the indexer.
  const sort: ExploreSort = pageSort === 'for-you' ? 'best' : pageSort;
  const forYouTopicIds = pageSort === 'for-you' ? parseFollowedTopicIds(searchParams.get('followedTopicIds')) : [];
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
    const visible = browseSidebarVisibleSpaces(browse)
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
      excludeTypeIds: EXPLORE_EXCLUDED_TYPE_IDS,
      requireName: true,
      // GEO-2835. A restriction on the feed rather than on the selection, unlike the types filter:
      // ticking Claim asks for the claims Explore has, and an untagged one is not among them.
      requireDebateTagOnClaims: true,
      // GEO-3070. Explore's Best opens on a playable debate.
      leadWithPlayableDebate: true,
      forYouTopicIds,
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error('explore feed', e);
    return feedUnavailableResponse();
  }
}

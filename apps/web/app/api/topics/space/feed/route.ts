import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { NextResponse } from 'next/server';

import { parseExploreSort } from '~/core/explore/explore-feed-params';
import { feedUnavailableResponse } from '~/core/explore/feed-route-response';
import { fetchExploreFeed } from '~/core/explore/fetch-explore-feed';
import { resolveExploreFeedRequestContext } from '~/core/explore/resolve-explore-feed-request-context';
import { topicsRelationFilter } from '~/core/topics/browse/topic-feed-filter';
import { MAX_TOPIC_FEED_SELECTED_TOPICS, parseTopicFeedIds } from '~/core/topics/browse/topic-feed-params';
import { parseTopicFeedTypeIds } from '~/core/topics/browse/topic-feed-types';

/**
 * The Explore feed on a topic space's homepage: every entity of the Topic feed types that lives in
 * the space, rather than every entity tagged with one topic.
 *
 * The space *is* the topic here, so membership is the scope and no Topics relation is required.
 * Topic selections from the filter still narrow it, AND-composed like the topic page's.
 *
 * Ranked through the ordinary Explore paths rather than the Topic page's complete-population
 * index: that index downloads the whole population to sort it, which is fine for the entities one
 * topic names and not for a space holding tens of thousands.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const spaceId = searchParams.get('spaceId');
  if (!spaceId || !IdUtils.isValid(spaceId)) {
    return NextResponse.json({ items: [], nextCursor: null }, { status: 400 });
  }

  const typeIds = parseTopicFeedTypeIds(searchParams.get('typeIds'));
  if (typeIds.length === 0) return NextResponse.json({ items: [], nextCursor: null });

  const selectedTopicIds = parseTopicFeedIds(searchParams.get('topicIds')).slice(0, MAX_TOPIC_FEED_SELECTED_TOPICS);
  const { browse, memberOrEditorSpaceIds, walletAddress } = await resolveExploreFeedRequestContext(spaceId);

  try {
    const result = await fetchExploreFeed({
      browse,
      sort: parseExploreSort(searchParams.get('sort')),
      time: 'all',
      spaceFilterIds: [spaceId],
      cursor: searchParams.get('cursor'),
      walletAddress,
      memberOrEditorSpaceIds,
      typeIds,
      requireName: true,
      entityFilter: topicsRelationFilter(selectedTopicIds),
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error('space topic feed', error);
    return feedUnavailableResponse();
  }
}

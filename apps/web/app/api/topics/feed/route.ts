import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { NextResponse } from 'next/server';

import { parseExploreSort } from '~/core/explore/explore-feed-params';
import { feedUnavailableResponse } from '~/core/explore/feed-route-response';
import { fetchExploreFeed } from '~/core/explore/fetch-explore-feed';
import { resolveExploreFeedRequestContext } from '~/core/explore/resolve-explore-feed-request-context';
import { topicFeedFilter, topicFeedPopulationScopes } from '~/core/topics/browse/topic-feed-filter';
import { parseTopicFeedSelectedIds, parseTopicFeedSpaceIds } from '~/core/topics/browse/topic-feed-params';
import { parseTopicFeedTypeIds } from '~/core/topics/browse/topic-feed-types';

/** Mixed Topic rabbit-hole feed: direct topic entities plus Debates reached through their Claim. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const topicId = searchParams.get('topicId');
  const routeSpaceId = searchParams.get('spaceId');
  if (!topicId || !IdUtils.isValid(topicId) || !routeSpaceId || !IdUtils.isValid(routeSpaceId)) {
    return NextResponse.json({ items: [], nextCursor: null }, { status: 400 });
  }

  const typeIds = parseTopicFeedTypeIds(searchParams.get('typeIds'));
  if (typeIds.length === 0) return NextResponse.json({ items: [], nextCursor: null });

  const selectedTopicIds = parseTopicFeedSelectedIds(searchParams.get('topicIds'), topicId);
  const requestedSpaceIds = parseTopicFeedSpaceIds(searchParams.get('spaceIds'), routeSpaceId);
  const { browse, memberOrEditorSpaceIds, walletAddress } = await resolveExploreFeedRequestContext(routeSpaceId);
  const completePopulationScopes = topicFeedPopulationScopes(topicId, selectedTopicIds, typeIds);

  try {
    const result = await fetchExploreFeed({
      browse,
      sort: parseExploreSort(searchParams.get('sort')),
      time: 'all',
      spaceFilterIds: requestedSpaceIds.length > 0 ? requestedSpaceIds : null,
      cursor: searchParams.get('cursor'),
      walletAddress,
      memberOrEditorSpaceIds,
      typeIds,
      requireName: true,
      entityFilter: topicFeedFilter(topicId, selectedTopicIds),
      completePopulationScopes,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error('topic feed', error);
    return feedUnavailableResponse();
  }
}

import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { NextResponse } from 'next/server';

import {
  emptyTopicFeedCompositionCounts,
  fetchTopicFeedCompositionCounts,
} from '~/core/topics/browse/topic-feed-facets';
import { parseTopicFeedSpaceIds } from '~/core/topics/browse/topic-feed-params';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const topicId = searchParams.get('topicId');
  const routeSpaceId = searchParams.get('spaceId');
  const spaceIds = parseTopicFeedSpaceIds(searchParams.get('spaceIds'), routeSpaceId ?? undefined);
  if (
    !topicId ||
    !IdUtils.isValid(topicId) ||
    !routeSpaceId ||
    !IdUtils.isValid(routeSpaceId) ||
    spaceIds.length === 0
  ) {
    return NextResponse.json(emptyTopicFeedCompositionCounts(), { status: 400 });
  }

  try {
    return NextResponse.json(await fetchTopicFeedCompositionCounts({ spaceIds, topicId }));
  } catch (error) {
    console.error('topic feed composition', error);
    return NextResponse.json(emptyTopicFeedCompositionCounts(), { status: 500 });
  }
}

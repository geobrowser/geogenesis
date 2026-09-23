import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { NextResponse } from 'next/server';

import { fetchTopicFeedCompositionCounts } from '~/core/topics/browse/topic-feed-facets';
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
    return NextResponse.json({ claims: 0, debates: 0, news: 0 }, { status: 400 });
  }

  try {
    return NextResponse.json(await fetchTopicFeedCompositionCounts({ spaceIds, topicId, signal: request.signal }));
  } catch (error) {
    console.error('topic feed composition', error);
    return NextResponse.json({ claims: 0, debates: 0, news: 0 }, { status: 500 });
  }
}

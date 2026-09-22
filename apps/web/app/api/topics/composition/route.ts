import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { NextResponse } from 'next/server';

import { fetchTopicFeedCompositionCounts } from '~/core/topics/browse/topic-feed-facets';
import { resolveTopicFeedRequestContext } from '~/core/topics/browse/topic-feed-request-context';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const topicId = searchParams.get('topicId');
  const routeSpaceId = searchParams.get('spaceId');
  if (!topicId || !IdUtils.isValid(topicId) || !routeSpaceId || !IdUtils.isValid(routeSpaceId)) {
    return NextResponse.json({ claims: 0, debates: 0, news: 0 }, { status: 400 });
  }

  try {
    const { browse } = await resolveTopicFeedRequestContext(routeSpaceId);
    return NextResponse.json(await fetchTopicFeedCompositionCounts({ browse, topicId, signal: request.signal }));
  } catch (error) {
    console.error('topic feed composition', error);
    return NextResponse.json({ claims: 0, debates: 0, news: 0 }, { status: 500 });
  }
}

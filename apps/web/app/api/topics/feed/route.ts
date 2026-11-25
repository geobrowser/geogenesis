import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { NextResponse } from 'next/server';

import { feedUnavailableResponse } from '~/core/explore/feed-route-response';
import { readTopicFeed } from '~/core/topics/browse/read-topic-feed';

/** Mixed Topic feed: every entity is matched by its own Topics relations. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const topicId = searchParams.get('topicId');
  const routeSpaceId = searchParams.get('spaceId');
  if (!topicId || !IdUtils.isValid(topicId) || !routeSpaceId || !IdUtils.isValid(routeSpaceId)) {
    return NextResponse.json({ items: [], nextCursor: null }, { status: 400 });
  }

  try {
    const result = await readTopicFeed({
      topicId,
      routeSpaceId,
      typeIds: searchParams.get('typeIds'),
      sort: searchParams.get('sort'),
      topicIds: searchParams.get('topicIds'),
      spaceIds: searchParams.get('spaceIds'),
      cursor: searchParams.get('cursor'),
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error('topic feed', error);
    return feedUnavailableResponse();
  }
}

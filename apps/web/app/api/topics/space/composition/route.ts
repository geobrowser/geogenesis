import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { NextResponse } from 'next/server';

import {
  emptyTopicFeedCompositionCounts,
  fetchSpaceTopicCompositionCounts,
} from '~/core/topics/browse/topic-feed-facets';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const spaceId = searchParams.get('spaceId');
  if (!spaceId || !IdUtils.isValid(spaceId)) {
    return NextResponse.json(emptyTopicFeedCompositionCounts(), { status: 400 });
  }

  try {
    return NextResponse.json(await fetchSpaceTopicCompositionCounts({ spaceId }));
  } catch (error) {
    console.error('space topic feed composition', error);
    return NextResponse.json(emptyTopicFeedCompositionCounts(), { status: 500 });
  }
}

import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { NextResponse } from 'next/server';

import { fetchSpaceTopicFeedFacets } from '~/core/topics/browse/topic-feed-facets';
import { parseTopicFeedSelectedIds } from '~/core/topics/browse/topic-feed-params';
import { parseTopicFeedBodyTypeIds } from '~/core/topics/browse/topic-feed-types';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    selectedTopicIds?: unknown;
    typeIds?: unknown;
    fixedParams?: Record<string, unknown>;
  } | null;
  const spaceId = body?.fixedParams?.spaceId;
  const spaceTopicId = body?.fixedParams?.spaceTopicId;
  if (
    typeof spaceId !== 'string' ||
    !IdUtils.isValid(spaceId) ||
    typeof spaceTopicId !== 'string' ||
    !IdUtils.isValid(spaceTopicId)
  ) {
    return NextResponse.json({ topics: [] }, { status: 400 });
  }

  const selectedTopicIds = parseTopicFeedSelectedIds(body?.selectedTopicIds);
  const typeIds = parseTopicFeedBodyTypeIds(body?.typeIds);
  if (typeIds.length === 0) {
    return NextResponse.json({ topics: [] });
  }

  try {
    const topics = await fetchSpaceTopicFeedFacets({
      spaceId,
      spaceTopicId,
      selectedTopicIds,
      typeIds,
    });
    return NextResponse.json({ topics });
  } catch (error) {
    console.error('space topic feed facets', error);
    return NextResponse.json({ topics: [] }, { status: 500 });
  }
}

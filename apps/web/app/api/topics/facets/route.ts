import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { NextResponse } from 'next/server';

import { fetchTopicFeedFacets } from '~/core/topics/browse/topic-feed-facets';
import { parseTopicFeedSelectedIds, parseTopicFeedSpaceIds } from '~/core/topics/browse/topic-feed-params';
import { parseTopicFeedTypeIds } from '~/core/topics/browse/topic-feed-types';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    selectedTopicIds?: unknown;
    typeIds?: unknown;
    fixedParams?: Record<string, unknown>;
  } | null;
  const topicId = body?.fixedParams?.topicId;
  const routeSpaceId = body?.fixedParams?.spaceId;
  const spaceIds = parseTopicFeedSpaceIds(
    body?.fixedParams?.spaceIds,
    typeof routeSpaceId === 'string' ? routeSpaceId : undefined
  );
  if (
    typeof topicId !== 'string' ||
    !IdUtils.isValid(topicId) ||
    typeof routeSpaceId !== 'string' ||
    !IdUtils.isValid(routeSpaceId) ||
    spaceIds.length === 0
  ) {
    return NextResponse.json({ topics: [] }, { status: 400 });
  }

  const selectedTopicIds = parseTopicFeedSelectedIds(body?.selectedTopicIds, topicId);
  const typeIds = Array.isArray(body?.typeIds)
    ? parseTopicFeedTypeIds(body.typeIds.filter((id): id is string => typeof id === 'string').join(','))
    : parseTopicFeedTypeIds(null);
  if (typeIds.length === 0) {
    return NextResponse.json({ topics: [] });
  }

  try {
    const topics = await fetchTopicFeedFacets({
      spaceIds,
      topicId,
      selectedTopicIds,
      typeIds,
      signal: request.signal,
    });
    return NextResponse.json({ topics });
  } catch (error) {
    console.error('topic feed facets', error);
    return NextResponse.json({ topics: [] }, { status: 500 });
  }
}

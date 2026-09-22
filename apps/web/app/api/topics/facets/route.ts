import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { NextResponse } from 'next/server';

import { fetchTopicFeedFacets } from '~/core/topics/browse/topic-feed-facets';
import { resolveTopicFeedRequestContext } from '~/core/topics/browse/topic-feed-request-context';
import { parseTopicFeedTypeIds } from '~/core/topics/browse/topic-feed-types';
import { normId } from '~/core/utils/norm-id';

function parseIds(raw: unknown) {
  return [
    ...new Map(
      (Array.isArray(raw) ? raw : [])
        .filter((id): id is string => typeof id === 'string')
        .filter(IdUtils.isValid)
        .map(id => [normId(id), id])
    ).values(),
  ];
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    selectedTopicIds?: unknown;
    typeIds?: unknown;
    fixedParams?: Record<string, unknown>;
  } | null;
  const topicId = body?.fixedParams?.topicId;
  const routeSpaceId = body?.fixedParams?.spaceId;
  if (
    typeof topicId !== 'string' ||
    !IdUtils.isValid(topicId) ||
    typeof routeSpaceId !== 'string' ||
    !IdUtils.isValid(routeSpaceId)
  ) {
    return NextResponse.json({ topics: [] }, { status: 400 });
  }

  const selectedTopicIds = parseIds(body?.selectedTopicIds).filter(id => normId(id) !== normId(topicId));
  const typeIds = Array.isArray(body?.typeIds)
    ? parseTopicFeedTypeIds(body.typeIds.filter((id): id is string => typeof id === 'string').join(','))
    : parseTopicFeedTypeIds(null);
  if (typeIds.length === 0) {
    return NextResponse.json({ topics: [] });
  }

  try {
    const { browse } = await resolveTopicFeedRequestContext(routeSpaceId);
    const topics = await fetchTopicFeedFacets({
      browse,
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

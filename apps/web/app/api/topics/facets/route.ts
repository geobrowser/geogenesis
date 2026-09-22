import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { NextResponse } from 'next/server';

import type { ExploreSort } from '~/core/explore/fetch-explore-feed';
import { fetchTopicFeedFacets } from '~/core/topics/browse/topic-feed-facets';
import { parseTopicFeedTypeIds } from '~/core/topics/browse/topic-feed-types';
import { normId } from '~/core/utils/norm-id';

const SORTS: ExploreSort[] = ['best', 'new', 'top'];

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
    sort?: unknown;
    fixedParams?: Record<string, unknown>;
  } | null;
  const topicId = body?.fixedParams?.topicId;
  const routeSpaceId = body?.fixedParams?.spaceId;
  const spaceIds = parseIds(
    typeof body?.fixedParams?.spaceIds === 'string' ? body.fixedParams.spaceIds.split(',') : []
  ).slice(0, 100);
  if (
    typeof topicId !== 'string' ||
    !IdUtils.isValid(topicId) ||
    typeof routeSpaceId !== 'string' ||
    !IdUtils.isValid(routeSpaceId) ||
    spaceIds.length === 0
  ) {
    return NextResponse.json({ topics: [] }, { status: 400 });
  }

  const selectedTopicIds = parseIds(body?.selectedTopicIds).filter(id => normId(id) !== normId(topicId));
  const sort =
    typeof body?.sort === 'string' && SORTS.includes(body.sort as ExploreSort) ? (body.sort as ExploreSort) : 'best';
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
      sort,
      signal: request.signal,
    });
    return NextResponse.json({ topics });
  } catch (error) {
    console.error('topic feed facets', error);
    return NextResponse.json({ topics: [] }, { status: 500 });
  }
}

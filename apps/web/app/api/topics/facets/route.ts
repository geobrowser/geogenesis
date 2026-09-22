import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { NextResponse } from 'next/server';

import { fetchTopicFeedFacetCounts } from '~/core/topics/browse/topic-feed-facets';
import { resolveTopicFeedRequestContext } from '~/core/topics/browse/topic-feed-request-context';
import { parseTopicFeedTypeIds } from '~/core/topics/browse/topic-feed-types';
import { normId } from '~/core/utils/norm-id';

const MAX_CANDIDATE_TOPICS = 50;

function parseIds(raw: unknown, limit = MAX_CANDIDATE_TOPICS) {
  return [
    ...new Map(
      (Array.isArray(raw) ? raw : [])
        .filter((id): id is string => typeof id === 'string')
        .filter(IdUtils.isValid)
        .map(id => [normId(id), id])
    ).values(),
  ].slice(0, limit);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    candidateTopicIds?: unknown;
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
    return NextResponse.json({ counts: {} }, { status: 400 });
  }

  const selectedTopicIds = parseIds(body?.selectedTopicIds).filter(id => normId(id) !== normId(topicId));
  const candidateTopicIds = parseIds(body?.candidateTopicIds).filter(id => normId(id) !== normId(topicId));
  if (candidateTopicIds.length === 0) return NextResponse.json({ counts: {} });

  const typeIds = Array.isArray(body?.typeIds)
    ? parseTopicFeedTypeIds(body.typeIds.filter((id): id is string => typeof id === 'string').join(','))
    : parseTopicFeedTypeIds(null);
  if (typeIds.length === 0) {
    return NextResponse.json({ counts: Object.fromEntries(candidateTopicIds.map(id => [normId(id), 0])) });
  }

  try {
    const { browse } = await resolveTopicFeedRequestContext(routeSpaceId);
    const counts = await fetchTopicFeedFacetCounts({
      browse,
      topicId,
      selectedTopicIds,
      candidateTopicIds,
      typeIds,
      signal: request.signal,
    });
    return NextResponse.json({ counts });
  } catch (error) {
    console.error('topic feed facets', error);
    return NextResponse.json({ counts: {} }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';

import { fetchExploreTopicFacets } from '~/core/explore/explore-topic-facets';
import { normId } from '~/core/utils/norm-id';

function parseIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === 'string' && id.length > 0).map(normId);
}

/**
 * Exact topic-dropdown counts for the Explore feed, from gaia's topic ranking table
 * (`topicFeedTypeCounts`) so the number agrees with what the feed serves.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    selectedTopicIds?: unknown;
    typeIds?: unknown;
    spaceIds?: unknown;
    fixedParams?: Record<string, unknown>;
  } | null;

  const selectedTopicIds = parseIds(body?.selectedTopicIds);
  const typeIds = parseIds(body?.typeIds);
  const spaceIds = parseIds(body?.spaceIds);

  const requireDebateTagOnClaims = body?.fixedParams?.requireDebateTagOnClaims !== 'false';

  if (typeIds.length === 0 || spaceIds.length === 0) {
    return NextResponse.json({ topics: [] });
  }

  try {
    const topics = await fetchExploreTopicFacets({
      spaceIds,
      selectedTopicIds,
      typeIds,
      requireDebateTagOnClaims,
      signal: request.signal,
    });
    return NextResponse.json({ topics });
  } catch (error) {
    console.error('explore topic facets', error);
    return NextResponse.json({ topics: [] }, { status: 500 });
  }
}

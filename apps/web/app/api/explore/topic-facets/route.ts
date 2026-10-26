import { NextResponse } from 'next/server';

import { browseSidebarVisibleSpaces } from '~/core/browse/fetch-browse-sidebar-data';
import { DEFAULT_EXPLORE_TYPE_IDS } from '~/core/explore/explore-constants';
import { type ExploreTopicFacet, fetchExploreTopicFacets } from '~/core/explore/explore-topic-facets';
import { sanitizeExploreTypeIds } from '~/core/explore/explore-type-filter';
import { narrowExploreSpaceFilter } from '~/core/explore/narrow-explore-space-filter';
import { resolveExploreFeedRequestContext } from '~/core/explore/resolve-explore-feed-request-context';
import { normId } from '~/core/utils/norm-id';

function parseIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === 'string' && id.length > 0).map(normId);
}

function parseTypeIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_EXPLORE_TYPE_IDS];
  return sanitizeExploreTypeIds(raw);
}

/**
 * A short in-process cache so repeated opens of the dropdown reuse a recent count. Keyed on the
 * resolved space set.
 */
const FACET_CACHE_TTL_MS = 60_000;
const FACET_CACHE_MAX_ENTRIES = 200;
const facetCache = new Map<string, { topics: ExploreTopicFacet[]; expiresAt: number }>();

function facetCacheKey(parts: {
  selectedTopicIds: string[];
  typeIds: string[];
  spaceIds: string[];
  requireDebateTagOnClaims: boolean;
}): string {
  return JSON.stringify({
    t: [...parts.selectedTopicIds].sort(),
    y: [...parts.typeIds].sort(),
    s: [...parts.spaceIds].sort(),
    d: parts.requireDebateTagOnClaims,
  });
}

function readFacetCache(key: string): ExploreTopicFacet[] | null {
  const hit = facetCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    facetCache.delete(key);
    return null;
  }
  return hit.topics;
}

function writeFacetCache(key: string, topics: ExploreTopicFacet[]): void {
  if (facetCache.size >= FACET_CACHE_MAX_ENTRIES) {
    const oldest = facetCache.keys().next().value;
    if (oldest !== undefined) facetCache.delete(oldest);
  }
  facetCache.set(key, { topics, expiresAt: Date.now() + FACET_CACHE_TTL_MS });
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
  const typeIds = parseTypeIds(body?.typeIds);

  const tickedSpaceIds = parseIds(body?.spaceIds);

  const requireDebateTagOnClaims = body?.fixedParams?.requireDebateTagOnClaims !== 'false';

  if (typeIds.length === 0) {
    return NextResponse.json({ topics: [] });
  }

  const { browse } = await resolveExploreFeedRequestContext();
  const spaceFilter = narrowExploreSpaceFilter(browse, tickedSpaceIds.length > 0 ? tickedSpaceIds.join(',') : null);
  const spaceIds = (spaceFilter ?? browseSidebarVisibleSpaces(browse).map(row => row.id)).map(normId);

  if (spaceIds.length === 0) {
    return NextResponse.json({ topics: [] });
  }

  const cacheKey = facetCacheKey({ selectedTopicIds, typeIds, spaceIds, requireDebateTagOnClaims });
  const cached = readFacetCache(cacheKey);
  if (cached) return NextResponse.json({ topics: cached });

  try {
    const topics = await fetchExploreTopicFacets({
      spaceIds,
      selectedTopicIds,
      typeIds,
      requireDebateTagOnClaims,
      signal: request.signal,
    });
    if (topics.length > 0) writeFacetCache(cacheKey, topics);
    return NextResponse.json({ topics });
  } catch (error) {
    console.error('explore topic facets', error);
    return NextResponse.json({ topics: [] }, { status: 500 });
  }
}

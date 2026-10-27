import { Effect } from 'effect';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { buildExploreFeedFilter } from '~/core/explore/fetch-explore-feed';
import type { EntityFilter, RelationFilter } from '~/core/gql/graphql';
import { graphql } from '~/core/io/graphql-client';
import { getEntityNames } from '~/core/io/queries';
import { decodeRelationFacet, relationFacetByFilterDocument } from '~/core/io/relation-facet';
import { normId } from '~/core/utils/norm-id';
import { createPromiseTtlCache } from '~/core/utils/promise-ttl-cache';

import { spaceTopicCountDocument } from './space-topic-count-document';
import { topicFeedFilter, topicsRelationFilter } from './topic-feed-filter';
import { topicFeedTypeCountsDocument } from './topic-feed-type-counts-document';
import { TOPIC_FEED_ENTITY_TYPE_IDS } from './topic-feed-types';

export type TopicFeedFacet = { id: string; name: string | null; count: number };

/**
 * Server-side caches for the topic-space reads, which are identical across visitors and take
 * seconds each on the large spaces. The 60s matches the client's `staleTime` for the same data.
 */
const SPACE_TOPIC_CACHE_TTL_MS = 60_000;
const spaceTopicFacetsCache = createPromiseTtlCache<TopicFeedFacet[]>({
  ttlMs: SPACE_TOPIC_CACHE_TTL_MS,
  maxEntries: 64,
});
const spaceTopicCountsCache = createPromiseTtlCache<TopicFeedCompositionCounts>({
  ttlMs: SPACE_TOPIC_CACHE_TTL_MS,
  maxEntries: 64,
});

/** For tests: forget every cached topic-space read. */
export function clearSpaceTopicCaches() {
  spaceTopicFacetsCache.clear();
  spaceTopicCountsCache.clear();
}

type TopicFacetArgs = {
  spaceIds: string[];
  topicId: string;
  selectedTopicIds: readonly string[];
  typeIds: readonly string[];
  signal?: AbortSignal;
};

function scopedFeedFilter(
  spaceIds: string[],
  typeIds: readonly string[],
  entityFilter: EntityFilter | undefined,
  requireDebateTagOnClaims = false
) {
  return buildExploreFeedFilter({
    spaceIds,
    time: 'all',
    typeIds,
    requireName: true,
    requireDebateTagOnClaims,
    includeEntityScopeInFilter: true,
    entityFilter,
  });
}

async function fetchTopicNames(ids: string[], signal?: AbortSignal) {
  const rows = await Effect.runPromise(getEntityNames(ids, signal));
  return new Map(rows.map(row => [normId(row.id), row.name]));
}

async function namedFacets(counts: Map<string, number>, excludedTopicId: string, signal?: AbortSignal) {
  counts.delete(normId(excludedTopicId));
  const names = await fetchTopicNames([...counts.keys()], signal);
  return [...counts]
    .map(([id, count]) => ({ id, count, name: names.get(id) ?? null }))
    .sort((left, right) => right.count - left.count || (left.name ?? left.id).localeCompare(right.name ?? right.id));
}

/** Counts distinct feed entities per direct Topic relation in one grouped aggregate. */
export async function fetchTopicFeedFacets({
  spaceIds,
  topicId,
  selectedTopicIds,
  typeIds,
  signal,
}: TopicFacetArgs): Promise<TopicFeedFacet[]> {
  if (typeIds.length === 0 || spaceIds.length === 0) return [];

  return fetchFacetsForPopulation({
    spaceIds,
    typeIds,
    entityFilter: topicFeedFilter(topicId, selectedTopicIds),
    excludedTopicId: topicId,
    signal,
  });
}

async function fetchFacetsForPopulation({
  spaceIds,
  typeIds,
  entityFilter,
  excludedTopicId,
  requireDebateTagOnClaims,
  signal,
}: {
  spaceIds: string[];
  typeIds: readonly string[];
  entityFilter: EntityFilter | undefined;
  excludedTopicId: string;
  requireDebateTagOnClaims?: boolean;
  signal?: AbortSignal;
}): Promise<TopicFeedFacet[]> {
  const facets = await Effect.runPromise(
    graphql({
      query: relationFacetByFilterDocument,
      decoder: decodeRelationFacet,
      variables: {
        filter: {
          typeId: { is: TOPICS_PROPERTY_ID },
          fromEntity: scopedFeedFilter(spaceIds, typeIds, entityFilter, requireDebateTagOnClaims),
        } satisfies RelationFilter,
        groupBy: ['TO_ENTITY_ID'],
      },
      signal,
    })
  );
  const counts = new Map(facets.map(facet => [normId(facet.id), facet.count]));
  return namedFacets(counts, excludedTopicId, signal);
}

/**
 * The Topic facets for a topic space's own feed: every topic its entities name, with the space's
 * own home topic left out.
 *
 * Left out because nearly everything in a topic space is tagged with the topic the space is
 * about, so offering it would be a filter that narrows nothing — the same reason the topic page
 * drops its own topic.
 */
export async function fetchSpaceTopicFeedFacets({
  spaceId,
  spaceTopicId,
  selectedTopicIds,
  typeIds,
}: {
  spaceId: string;
  spaceTopicId: string;
  selectedTopicIds: readonly string[];
  typeIds: readonly string[];
}): Promise<TopicFeedFacet[]> {
  if (typeIds.length === 0) return [];

  // Every visitor's first load asks the same question, and the aggregate takes seconds on a large
  // space. No request signal reaches the load: it is shared, so one reader leaving cannot cancel
  // it for the others.
  const key = JSON.stringify([
    normId(spaceId),
    normId(spaceTopicId),
    selectedTopicIds.map(normId).sort(),
    typeIds.map(normId).sort(),
  ]);
  return spaceTopicFacetsCache.get(key, () =>
    fetchFacetsForPopulation({
      spaceIds: [spaceId],
      typeIds,
      entityFilter: topicsRelationFilter(selectedTopicIds),
      excludedTopicId: spaceTopicId,
      // The feed's own gate, so a topic is offered only with the claims the feed will actually show.
      requireDebateTagOnClaims: true,
    })
  );
}

export type TopicFeedCompositionCounts = { typeCounts: Record<string, number> };

export function emptyTopicFeedCompositionCounts(): TopicFeedCompositionCounts {
  return { typeCounts: Object.fromEntries(TOPIC_FEED_ENTITY_TYPE_IDS.map(id => [id, 0])) };
}

/**
 * Per-type counts for a topic page's composition strip, over the population its feed pages through:
 * entities tagged with the topic, in these spaces (GEO-3092). gaia counts them from its topic
 * ranking table, so the strip no longer downloads the topic's whole population to count it.
 *
 * An entity carrying more than one feed type is counted once in each.
 */
export async function fetchTopicFeedCompositionCounts({
  spaceIds,
  topicId,
}: {
  spaceIds: string[];
  topicId: string;
}): Promise<TopicFeedCompositionCounts> {
  if (spaceIds.length === 0) return emptyTopicFeedCompositionCounts();

  const rows = await Effect.runPromise(
    graphql({
      query: topicFeedTypeCountsDocument,
      decoder: data => data.topicFeedTypeCounts ?? [],
      variables: {
        topicIds: [topicId],
        typeIds: [...TOPIC_FEED_ENTITY_TYPE_IDS],
        spaceIds,
        // The topic feed shows every claim, curated for debate or not.
        debateTaggedClaims: false,
      },
    })
  );
  const normalizedIdToCanonicalId = new Map(TOPIC_FEED_ENTITY_TYPE_IDS.map(id => [normId(id), id]));
  // A type with nothing in it is absent from the list, so every type starts at zero.
  const counts = emptyTopicFeedCompositionCounts();

  for (const row of rows) {
    if (typeof row?.typeId !== 'string') continue;
    const typeId = normalizedIdToCanonicalId.get(normId(row.typeId));
    const count = Number(row.entityCount);
    if (typeId && Number.isFinite(count)) counts.typeCounts[typeId] = count;
  }

  return counts;
}

/**
 * Per-type counts for a topic space's feed: every named entity of each feed type in the space.
 *
 * Counted per type with `totalCount`, not from gaia's topic ranking table as a topic page's are:
 * a space's feed is everything in the space, not the entities tagged with one topic. One aliased
 * request carries all eleven counts.
 */
export async function fetchSpaceTopicCompositionCounts({
  spaceId,
}: {
  spaceId: string;
}): Promise<TopicFeedCompositionCounts> {
  // Shared across visitors for the same reason, and with the same caveat, as the facets above.
  return spaceTopicCountsCache.get(normId(spaceId), () => loadSpaceTopicCompositionCounts(spaceId));
}

async function loadSpaceTopicCompositionCounts(spaceId: string): Promise<TopicFeedCompositionCounts> {
  // Same Debate-tag gate as the feed, so the Claims count is the claims a reader can scroll to.
  const filter = buildExploreFeedFilter({
    spaceIds: [spaceId],
    time: 'all',
    requireName: true,
    requireDebateTagOnClaims: true,
  });
  const totals = await Effect.runPromise(
    graphql({
      query: spaceTopicCountDocument,
      decoder: data => data,
      variables: { spaceIds: { in: [spaceId] }, filter },
    })
  );

  const counts = emptyTopicFeedCompositionCounts();
  TOPIC_FEED_ENTITY_TYPE_IDS.forEach((typeId, index) => {
    const total = Number(totals[`t${index}`]?.totalCount ?? 0);
    counts.typeCounts[typeId] = Number.isFinite(total) ? total : 0;
  });
  return counts;
}

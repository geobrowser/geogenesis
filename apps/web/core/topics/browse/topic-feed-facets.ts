import { Effect } from 'effect';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { buildExploreFeedFilter, fetchCompleteExplorePopulationIndex } from '~/core/explore/fetch-explore-feed';
import type { EntityFilter, RelationFilter } from '~/core/gql/graphql';
import { graphql } from '~/core/io/graphql-client';
import { getEntityNames } from '~/core/io/queries';
import { decodeRelationFacet, relationFacetByFilterDocument } from '~/core/io/relation-facet';
import { normId } from '~/core/utils/norm-id';

import { spaceTopicCountDocument } from './space-topic-count-document';
import { topicFeedFilter, topicFeedPopulationScopes, topicsRelationFilter } from './topic-feed-filter';
import { TOPIC_FEED_ENTITY_TYPE_IDS } from './topic-feed-types';

export type TopicFeedFacet = { id: string; name: string | null; count: number };

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
  const batches: string[][] = [];
  for (let index = 0; index < ids.length; index += 50) batches.push(ids.slice(index, index + 50));
  const rows = await Promise.all(batches.map(batch => Effect.runPromise(getEntityNames(batch, signal))));
  return new Map(rows.flat().map(row => [normId(row.id), row.name]));
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
  signal,
}: {
  spaceId: string;
  spaceTopicId: string;
  selectedTopicIds: readonly string[];
  typeIds: readonly string[];
  signal?: AbortSignal;
}): Promise<TopicFeedFacet[]> {
  if (typeIds.length === 0) return [];

  return fetchFacetsForPopulation({
    spaceIds: [spaceId],
    typeIds,
    entityFilter: topicsRelationFilter(selectedTopicIds),
    excludedTopicId: spaceTopicId,
    // The feed's own gate, so a topic is offered only with the claims the feed will actually show.
    requireDebateTagOnClaims: true,
    signal,
  });
}

export type TopicFeedCompositionCounts = { typeCounts: Record<string, number> };

export function emptyTopicFeedCompositionCounts(): TopicFeedCompositionCounts {
  return { typeCounts: Object.fromEntries(TOPIC_FEED_ENTITY_TYPE_IDS.map(id => [id, 0])) };
}

/**
 * Counts the exact compact population the Topic feed orders.
 *
 * The old implementation issued one relation-heavy `totalCount` connection per displayed type.
 * This instead reuses the feed's complete-population promise/cache and counts its tiny `typeIds`
 * field locally. That makes the header, dropdown and cards agree by construction while avoiding a
 * second graph scan on the common Best-first page load.
 */
export async function fetchTopicFeedCompositionCounts({
  spaceIds,
  topicId,
}: {
  spaceIds: string[];
  topicId: string;
}): Promise<TopicFeedCompositionCounts> {
  if (spaceIds.length === 0) return emptyTopicFeedCompositionCounts();

  const rows = await fetchCompleteExplorePopulationIndex({
    spaceIds,
    sort: 'best',
    time: 'all',
    typeIds: TOPIC_FEED_ENTITY_TYPE_IDS,
    requireName: true,
    scopes: topicFeedPopulationScopes(topicId, [], TOPIC_FEED_ENTITY_TYPE_IDS),
  });
  const normalizedIdToCanonicalId = new Map(TOPIC_FEED_ENTITY_TYPE_IDS.map(id => [normId(id), id]));
  const counts = emptyTopicFeedCompositionCounts();

  for (const row of rows) {
    // An entity can carry more than one selected type. Count it once in each matching bucket,
    // mirroring the dropdown's OR semantics without double-counting duplicate ids on the row.
    for (const normalizedTypeId of new Set((row.typeIds ?? []).flatMap(id => (id ? [normId(id)] : [])))) {
      const typeId = normalizedIdToCanonicalId.get(normalizedTypeId);
      if (typeId) counts.typeCounts[typeId] = (counts.typeCounts[typeId] ?? 0) + 1;
    }
  }

  return counts;
}

/**
 * Per-type counts for a topic space's feed: every named entity of each feed type in the space.
 *
 * Counted per type with `totalCount` rather than from the complete population the Topic page
 * sorts locally. A topic's population is the entities *tagged* with it, which stays small; a
 * space's is everything in it, and the large topic spaces hold 20–30 thousand — far too many to
 * download for a header. One aliased request carries all eleven counts.
 */
export async function fetchSpaceTopicCompositionCounts({
  spaceId,
  signal,
}: {
  spaceId: string;
  signal?: AbortSignal;
}): Promise<TopicFeedCompositionCounts> {
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
      signal,
    })
  );

  const counts = emptyTopicFeedCompositionCounts();
  TOPIC_FEED_ENTITY_TYPE_IDS.forEach((typeId, index) => {
    const total = Number(totals[`t${index}`]?.totalCount ?? 0);
    counts.typeCounts[typeId] = Number.isFinite(total) ? total : 0;
  });
  return counts;
}

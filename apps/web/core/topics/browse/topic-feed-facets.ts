import { Effect } from 'effect';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { buildExploreFeedFilter, fetchCompleteExplorePopulationIndex } from '~/core/explore/fetch-explore-feed';
import type { EntityFilter, RelationFilter } from '~/core/gql/graphql';
import { graphql } from '~/core/io/graphql-client';
import { getEntityNames } from '~/core/io/queries';
import { decodeRelationFacet, relationFacetByFilterDocument } from '~/core/io/relation-facet';
import { normId } from '~/core/utils/norm-id';

import { topicFeedFilter, topicFeedPopulationScopes } from './topic-feed-filter';
import { TOPIC_FEED_ENTITY_TYPE_IDS } from './topic-feed-types';

export type TopicFeedFacet = { id: string; name: string | null; count: number };

type TopicFacetArgs = {
  spaceIds: string[];
  topicId: string;
  selectedTopicIds: readonly string[];
  typeIds: readonly string[];
  signal?: AbortSignal;
};

function scopedFeedFilter(spaceIds: string[], typeIds: readonly string[], entityFilter: EntityFilter) {
  return buildExploreFeedFilter({
    spaceIds,
    time: 'all',
    typeIds,
    requireName: true,
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

async function namedFacets(counts: Map<string, number>, topicId: string, signal?: AbortSignal) {
  counts.delete(normId(topicId));
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

  const facets = await Effect.runPromise(
    graphql({
      query: relationFacetByFilterDocument,
      decoder: decodeRelationFacet,
      variables: {
        filter: {
          typeId: { is: TOPICS_PROPERTY_ID },
          fromEntity: scopedFeedFilter(spaceIds, typeIds, topicFeedFilter(topicId, selectedTopicIds)),
        } satisfies RelationFilter,
        groupBy: ['TO_ENTITY_ID'],
      },
      signal,
    })
  );
  const counts = new Map(facets.map(facet => [normId(facet.id), facet.count]));
  return namedFacets(counts, topicId, signal);
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

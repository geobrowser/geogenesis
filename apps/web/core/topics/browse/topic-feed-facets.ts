import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { DEBATE_CLAIMS_PROPERTY_ID } from '~/core/debates/ontology';
import { buildExploreFeedFilter, fetchCompleteExplorePopulationIndex } from '~/core/explore/fetch-explore-feed';
import type { EntityFilter, RelationFilter } from '~/core/gql/graphql';
import { graphql } from '~/core/io/graphql-client';
import { getEntityNames } from '~/core/io/queries';
import { decodeRelationFacet, relationFacetByFilterDocument } from '~/core/io/relation-facet';
import { normId } from '~/core/utils/norm-id';

import { topicFeedPopulationScopes } from './topic-feed-filter';
import { TOPIC_FEED_ENTITY_TYPE_IDS } from './topic-feed-types';

export type TopicFeedFacet = { id: string; name: string | null; count: number };

type TopicFacetArgs = {
  spaceIds: string[];
  topicId: string;
  selectedTopicIds: readonly string[];
  typeIds: readonly string[];
  signal?: AbortSignal;
};

type DebateTopicNode = {
  id?: string | null;
  relationsList?: Array<{
    toEntity?: {
      relationsList?: Array<{ toEntity?: { id?: string | null } | null } | null> | null;
    } | null;
  } | null> | null;
} | null;

type DebateTopicsResponse = {
  entitiesConnection?: {
    nodes?: DebateTopicNode[] | null;
    pageInfo?: { hasNextPage?: boolean | null; endCursor?: string | null } | null;
  } | null;
};

const DEBATE_TOPICS_SOURCE = /* GraphQL */ `
  query TopicFeedDebateTopics(
    $filter: EntityFilter!
    $first: Int!
    $after: Cursor
    $debateClaimsPropertyId: UUID!
    $topicsPropertyId: UUID!
  ) {
    entitiesConnection(filter: $filter, first: $first, after: $after) {
      nodes {
        id
        relationsList(first: 100, filter: { typeId: { is: $debateClaimsPropertyId } }) {
          toEntity {
            relationsList(first: 1000, filter: { typeId: { is: $topicsPropertyId } }) {
              toEntity {
                id
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const topicFeedDebateTopicsDocument = parse(DEBATE_TOPICS_SOURCE) as TypedDocumentNode<
  DebateTopicsResponse,
  {
    filter: EntityFilter;
    first: number;
    after?: string;
    debateClaimsPropertyId: string;
    topicsPropertyId: string;
  }
>;

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

async function fetchDebateTopicCounts(filter: EntityFilter, signal?: AbortSignal) {
  const counts = new Map<string, number>();
  let after: string | undefined;

  while (true) {
    const page = await Effect.runPromise(
      graphql({
        query: topicFeedDebateTopicsDocument,
        decoder: (response: DebateTopicsResponse) => response.entitiesConnection ?? null,
        variables: {
          filter,
          first: 500,
          after,
          debateClaimsPropertyId: DEBATE_CLAIMS_PROPERTY_ID,
          topicsPropertyId: TOPICS_PROPERTY_ID,
        },
        signal,
      })
    );

    for (const debate of page?.nodes ?? []) {
      // One Debate may point to several Claims carrying the same Topic. The feed has one Debate
      // card, so each Topic gets at most one count from this Debate.
      const debateTopicIds = new Set<string>();
      for (const claimRelation of debate?.relationsList ?? []) {
        for (const topicRelation of claimRelation?.toEntity?.relationsList ?? []) {
          const id = topicRelation?.toEntity?.id;
          if (id) debateTopicIds.add(normId(id));
        }
      }
      for (const id of debateTopicIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    }

    if (!page?.pageInfo?.hasNextPage || !page.pageInfo.endCursor) break;
    after = page.pageInfo.endCursor;
  }

  return counts;
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

/**
 * The same co-occurring Topic facet used by the Debate panel, widened to the mixed Topic feed.
 * Direct entities are one grouped aggregate over the already-filtered population. Debates are
 * traversed once and deduplicated by Debate because their Topics live on their debated Claims.
 */
export async function fetchTopicFeedFacets({
  spaceIds,
  topicId,
  selectedTopicIds,
  typeIds,
  signal,
}: TopicFacetArgs): Promise<TopicFeedFacet[]> {
  if (typeIds.length === 0 || spaceIds.length === 0) return [];

  const scopes = topicFeedPopulationScopes(topicId, selectedTopicIds, typeIds);
  const directScope = scopes.find(scope => scope.kind === 'direct');
  const debateScope = scopes.find(scope => scope.kind === 'debate');

  const directCountsPromise = !directScope
    ? Promise.resolve([])
    : Effect.runPromise(
        graphql({
          query: relationFacetByFilterDocument,
          decoder: decodeRelationFacet,
          variables: {
            filter: {
              typeId: { is: TOPICS_PROPERTY_ID },
              fromEntity: scopedFeedFilter(spaceIds, directScope.typeIds, directScope.entityFilter),
            } satisfies RelationFilter,
            groupBy: ['TO_ENTITY_ID'],
          },
          signal,
        })
      );

  const debateCountsPromise = debateScope
    ? fetchDebateTopicCounts(scopedFeedFilter(spaceIds, debateScope.typeIds, debateScope.entityFilter), signal)
    : Promise.resolve(new Map<string, number>());

  const [directCounts, debateCounts] = await Promise.all([directCountsPromise, debateCountsPromise]);
  const counts = new Map(directCounts.map(facet => [normId(facet.id), facet.count]));
  for (const [id, count] of debateCounts) counts.set(id, (counts.get(id) ?? 0) + count);
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

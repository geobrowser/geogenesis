import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { DEBATE_CLAIMS_PROPERTY_ID, DEBATE_TYPE_ID } from '~/core/debates/ontology';
import { buildExploreFeedFilter } from '~/core/explore/fetch-explore-feed';
import type { EntityFilter, RelationFilter } from '~/core/gql/graphql';
import { ID } from '~/core/id';
import { graphql } from '~/core/io/graphql-client';
import { getEntityNames } from '~/core/io/queries';
import { decodeRelationFacet, relationFacetByFilterDocument } from '~/core/io/relation-facet';
import { normId } from '~/core/utils/norm-id';

import { NEWS_STORY_TYPE_ID } from '../ontology';
import { debateTopicFeedFilter, directTopicFeedFilter } from './topic-feed-filter';

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

type CompositionResponse = Record<string, { totalCount?: number | string | null } | null | undefined>;

const COMPOSITION_SOURCE = /* GraphQL */ `
  query TopicFeedComposition($claims: EntityFilter!, $debates: EntityFilter!, $news: EntityFilter!) {
    claims: entitiesConnection(filter: $claims) {
      totalCount
    }
    debates: entitiesConnection(filter: $debates) {
      totalCount
    }
    news: entitiesConnection(filter: $news) {
      totalCount
    }
  }
`;

export const topicFeedCompositionDocument = parse(COMPOSITION_SOURCE) as TypedDocumentNode<
  CompositionResponse,
  { claims: EntityFilter; debates: EntityFilter; news: EntityFilter }
>;

function scopedFeedFilter(
  spaceIds: string[],
  topicId: string,
  typeIds: readonly string[],
  selectedTopicIds: string[],
  kind: 'direct' | 'debate'
) {
  return buildExploreFeedFilter({
    spaceIds,
    time: 'all',
    typeIds,
    requireName: true,
    includeEntityScopeInFilter: true,
    entityFilter:
      kind === 'debate'
        ? debateTopicFeedFilter(topicId, selectedTopicIds)
        : directTopicFeedFilter(topicId, selectedTopicIds),
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

  const directTypeIds = typeIds.filter(id => !ID.equals(id, DEBATE_TYPE_ID));
  const includesDebates = typeIds.some(id => ID.equals(id, DEBATE_TYPE_ID));

  const directCountsPromise =
    directTypeIds.length === 0
      ? Promise.resolve([])
      : Effect.runPromise(
          graphql({
            query: relationFacetByFilterDocument,
            decoder: decodeRelationFacet,
            variables: {
              filter: {
                typeId: { is: TOPICS_PROPERTY_ID },
                fromEntity: scopedFeedFilter(spaceIds, topicId, directTypeIds, [...selectedTopicIds], 'direct'),
              } satisfies RelationFilter,
              groupBy: ['TO_ENTITY_ID'],
            },
            signal,
          })
        );

  const debateCountsPromise = includesDebates
    ? fetchDebateTopicCounts(
        scopedFeedFilter(spaceIds, topicId, [DEBATE_TYPE_ID], [...selectedTopicIds], 'debate'),
        signal
      )
    : Promise.resolve(new Map<string, number>());

  const [directCounts, debateCounts] = await Promise.all([directCountsPromise, debateCountsPromise]);
  const counts = new Map(directCounts.map(facet => [normId(facet.id), facet.count]));
  for (const [id, count] of debateCounts) counts.set(id, (counts.get(id) ?? 0) + count);
  counts.delete(normId(topicId));

  const names = await fetchTopicNames([...counts.keys()], signal);
  return [...counts]
    .map(([id, count]) => ({ id, count, name: names.get(id) ?? null }))
    .sort((left, right) => right.count - left.count || (left.name ?? left.id).localeCompare(right.name ?? right.id));
}

/** Unique, display-eligible entities in the exact visible-space scope used by the Topic feed. */
export async function fetchTopicFeedCompositionCounts({
  spaceIds,
  topicId,
  signal,
}: {
  spaceIds: string[];
  topicId: string;
  signal?: AbortSignal;
}) {
  if (spaceIds.length === 0) return { claims: 0, debates: 0, news: 0 };

  return Effect.runPromise(
    graphql({
      query: topicFeedCompositionDocument,
      decoder: (response: CompositionResponse) => ({
        claims: Number(response.claims?.totalCount ?? 0),
        debates: Number(response.debates?.totalCount ?? 0),
        news: Number(response.news?.totalCount ?? 0),
      }),
      variables: {
        claims: scopedFeedFilter(spaceIds, topicId, [CLAIM_TYPE_ID], [], 'direct'),
        debates: scopedFeedFilter(spaceIds, topicId, [DEBATE_TYPE_ID], [], 'debate'),
        news: scopedFeedFilter(spaceIds, topicId, [NEWS_STORY_TYPE_ID], [], 'direct'),
      },
      signal,
    })
  );
}

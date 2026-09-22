import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { Effect } from 'effect';
import { parse } from 'graphql';

import type { BrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { DEBATE_TYPE_ID } from '~/core/debates/ontology';
import { buildExploreFeedFilter, exploreBrowseSpaceIds } from '~/core/explore/fetch-explore-feed';
import type { EntityFilter, RelationFilter } from '~/core/gql/graphql';
import { ID } from '~/core/id';
import { graphql } from '~/core/io/graphql-client';
import { decodeRelationFacet, relationFacetByFilterDocument } from '~/core/io/relation-facet';
import { normId } from '~/core/utils/norm-id';

import { topicFeedFilter } from './topic-feed-filter';

type TopicFacetArgs = {
  browse: BrowseSidebarData;
  topicId: string;
  selectedTopicIds: readonly string[];
  candidateTopicIds: readonly string[];
  typeIds: readonly string[];
  signal?: AbortSignal;
};

type DebateFacetResponse = Record<string, { totalCount?: number | string | null } | null | undefined>;

const debateFacetDocuments = new Map<number, TypedDocumentNode<DebateFacetResponse, Record<string, EntityFilter>>>();

function debateFacetDocument(count: number) {
  const cached = debateFacetDocuments.get(count);
  if (cached) return cached;

  const variables = Array.from({ length: count }, (_, index) => `$filter${index}: EntityFilter!`).join(', ');
  const fields = Array.from(
    { length: count },
    (_, index) => `topic${index}: entitiesConnection(filter: $filter${index}) { totalCount }`
  ).join('\n');
  const document = parse(`query TopicFeedDebateFacets(${variables}) { ${fields} }`) as TypedDocumentNode<
    DebateFacetResponse,
    Record<string, EntityFilter>
  >;
  debateFacetDocuments.set(count, document);
  return document;
}

/**
 * Counts the entities each Topic option would leave in the current Topic Explore feed.
 *
 * Directly-topic-tagged entities use one grouped relation aggregate. Debates are deliberately
 * counted separately as entities through Debate → Claim → Topic: grouping the Debate's Claim
 * relations would count claims, and a Debate discussing two claims under one Topic would be
 * doubled. Keeping Debate out of the direct aggregate also prevents a stray Topic relation on a
 * Debate from becoming a second source of truth.
 */
export async function fetchTopicFeedFacetCounts({
  browse,
  topicId,
  selectedTopicIds,
  candidateTopicIds,
  typeIds,
  signal,
}: TopicFacetArgs): Promise<Record<string, number>> {
  const candidates = [...new Map(candidateTopicIds.map(id => [normId(id), id])).values()];
  const counts = Object.fromEntries(candidates.map(id => [normId(id), 0]));
  const spaceIds = exploreBrowseSpaceIds(browse, null);
  if (candidates.length === 0 || typeIds.length === 0 || spaceIds.length === 0) return counts;

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
                toEntityId: { in: candidates },
                fromEntity: buildExploreFeedFilter({
                  spaceIds,
                  time: 'all',
                  typeIds: directTypeIds,
                  requireName: true,
                  includeEntityScopeInFilter: true,
                  entityFilter: topicFeedFilter(topicId, selectedTopicIds),
                }),
              } satisfies RelationFilter,
              groupBy: ['TO_ENTITY_ID'],
            },
            signal,
          })
        );

  const debateCountsPromise = includesDebates
    ? Effect.runPromise(
        graphql({
          query: debateFacetDocument(candidates.length),
          decoder: (response: DebateFacetResponse) =>
            candidates.map((_, index) => Number(response[`topic${index}`]?.totalCount ?? 0)),
          variables: Object.fromEntries(
            candidates.map((candidateId, index) => [
              `filter${index}`,
              buildExploreFeedFilter({
                spaceIds,
                time: 'all',
                typeIds: [DEBATE_TYPE_ID],
                requireName: true,
                includeEntityScopeInFilter: true,
                entityFilter: topicFeedFilter(topicId, [...selectedTopicIds, candidateId]),
              }),
            ])
          ),
          signal,
        })
      )
    : Promise.resolve(candidates.map(() => 0));

  const [directCounts, debateCounts] = await Promise.all([directCountsPromise, debateCountsPromise]);
  for (const facet of directCounts) counts[normId(facet.id)] = facet.count;
  candidates.forEach((id, index) => {
    counts[normId(id)] = (counts[normId(id)] ?? 0) + (debateCounts[index] ?? 0);
  });
  return counts;
}

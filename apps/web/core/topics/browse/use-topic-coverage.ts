'use client';

import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { ID } from '~/core/id';
import { graphql } from '~/core/io/graphql-client';

import { COVERAGE_TYPE_IDS } from '../ontology';

/**
 * Coverage of a topic: everything published elsewhere that names it.
 *
 * Asked of `relationsConnection` rather than of entities, which is what makes this one request
 * instead of three problems. The relation is the thing being counted, so the connection can filter
 * on both ends at once — `typeId` for the `Topics` relation, `fromEntity.typeIds` for the kind of
 * thing pointing — and hand back the rows, a real total and a cursor together.
 *
 * `overlaps`, not `containedBy`. The two agree on today's data because these entities carry exactly
 * one type each, but they mean different things: `containedBy` requires the entity's types to be a
 * *subset* of the list, so an episode that ever picks up a second type would silently vanish.
 * `overlaps` asks "is it any of these kinds", which is the actual question.
 *
 * The `typeId` clause matters as much as the type list. Without it the filter matches any relation
 * aimed at the topic — a parent's `Subtopics` link included — and returns a count that looks
 * plausible and is wrong.
 *
 * Filtering server-side is also what keeps `Claim relation` out. It is the single largest carrier of
 * `Topics` in the graph — 830 of a 2,000-relation sample — and excluding claims by type client-side
 * never touched it, so roughly two in five coverage rows were claim plumbing.
 */
const TOPIC_COVERAGE_SOURCE = /* GraphQL */ `
  query TopicCoverage($topicsPropertyId: UUID!, $topicId: UUID!, $typeIds: [UUID!], $first: Int, $after: Cursor) {
    relationsConnection(
      first: $first
      after: $after
      filter: {
        typeId: { is: $topicsPropertyId }
        toEntityId: { is: $topicId }
        fromEntity: { typeIds: { overlaps: $typeIds } }
      }
    ) {
      totalCount
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        fromEntity {
          id
          name
          description
          spaceIds
          types {
            id
            name
          }
        }
      }
    }
  }
`;

const topicCoverageDocument = parse(TOPIC_COVERAGE_SOURCE) as TypedDocumentNode<any, any>;

export type CoverageItem = {
  id: string;
  name: string | null;
  description: string | null;
  spaceIds: string[];
  /** The first named type, which is what a row shows as its kind. */
  kind: string | null;
};

export type TopicCoveragePage = {
  items: CoverageItem[];
  totalCount: number;
  endCursor: string | null;
  hasNextPage: boolean;
};

const EMPTY_PAGE: TopicCoveragePage = { items: [], totalCount: 0, endCursor: null, hasNextPage: false };

type CoverageResponse = {
  relationsConnection?: {
    totalCount?: number | null;
    pageInfo?: { hasNextPage?: boolean | null; endCursor?: string | null } | null;
    nodes?:
      | ({
          fromEntity?: {
            id?: string | null;
            name?: string | null;
            description?: string | null;
            spaceIds?: (string | null)[] | null;
            types?: ({ id?: string | null; name?: string | null } | null)[] | null;
          } | null;
        } | null)[]
      | null;
  } | null;
};

export function useTopicCoverage({ topicId, first, after }: { topicId: string; first: number; after?: string }) {
  const { data, isLoading, isPlaceholderData } = useQuery({
    queryKey: ['topic', 'coverage', ID.uuidToHex(topicId), first, after ?? null],
    queryFn: ({ signal }) =>
      Effect.runPromise(
        graphql({
          query: topicCoverageDocument,
          decoder: (response: CoverageResponse): TopicCoveragePage => {
            const connection = response.relationsConnection;
            return {
              items: (connection?.nodes ?? []).flatMap(node => {
                const entity = node?.fromEntity;
                if (!entity?.id || !entity.name) return [];
                return [
                  {
                    id: entity.id,
                    name: entity.name,
                    description: entity.description ?? null,
                    spaceIds: (entity.spaceIds ?? []).filter((id): id is string => Boolean(id)),
                    kind: (entity.types ?? []).find(type => type?.name)?.name ?? null,
                  },
                ];
              }),
              totalCount: connection?.totalCount ?? 0,
              endCursor: connection?.pageInfo?.endCursor ?? null,
              hasNextPage: connection?.pageInfo?.hasNextPage ?? false,
            };
          },
          variables: {
            topicsPropertyId: ID.uuidToHex(TOPICS_PROPERTY_ID),
            topicId: ID.uuidToHex(topicId),
            typeIds: COVERAGE_TYPE_IDS.map(ID.uuidToHex),
            first,
            after,
          },
          signal,
        })
      ),
    // Holds the page being read while the next loads, so stepping doesn't collapse the section.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  return { page: data ?? EMPTY_PAGE, isLoading, isPlaceholderData };
}

'use client';

import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import {
  type ExploreCardEntity,
  type ExploreFeedRow,
  buildExploreFeedRows,
  decodeExploreCardEntity,
} from '~/core/explore/explore-card-item';
import { exploreCardNodeFields, exploreCardPropertyFragment } from '~/core/explore/explore-card-selection';
import { ID } from '~/core/id';
import { graphql } from '~/core/io/graphql-client';
import { normId } from '~/core/utils/norm-id';
import { validateSpaceId } from '~/core/utils/utils';

import { COVERAGE_TYPE_IDS } from '../ontology';

const FRAGMENT = 'TopicCoverageFragment';

/**
 * Coverage of a topic: everything published elsewhere that names it.
 *
 * Asked of `relationsConnection` rather than of entities, which is what makes this one request
 * instead of three problems. The relation is the thing being counted, so the connection can filter
 * on both ends at once — `typeId` for the `Topics` relation, `fromEntity.typeIds` for the kind of
 * thing pointing — and hand back the rows and a cursor together.
 *
 * No `totalCount`. The connection will answer with one, but a bare number beside the heading said
 * nothing a reader could use — the composition strip above already says how much of what a topic
 * holds — and asking for it is a second scan of the filtered set per page.
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
 *
 * The per-entity selection is the explore feed's own, so these rows decode into exactly the item an
 * `ExploreFeedCard` renders — the same title, description, thumbnail, type list, timestamp and
 * comment count, resolved by the same code rather than by an approximation of it.
 *
 * It is requested unscoped, unlike on the feed. A topic gathers across every space in the graph, so
 * there is no space list to narrow the values and relations to before the rows say which spaces they
 * came from. What bounds the payload is the property and relation-type narrowing, which still
 * applies; the decoder scopes each row to its own display space afterwards.
 */
const TOPIC_COVERAGE_SOURCE = /* GraphQL */ `
  ${exploreCardPropertyFragment(FRAGMENT)}

  query TopicCoverage(
    $topicsPropertyId: UUID!
    $topicId: UUID!
    $typeIds: [UUID!]
    $spaceIds: [UUID!]
    $first: Int
    $after: Cursor
  ) {
    relationsConnection(
      first: $first
      after: $after
      filter: {
        typeId: { is: $topicsPropertyId }
        toEntityId: { is: $topicId }
        fromEntity: { typeIds: { overlaps: $typeIds }, spaceIds: { overlaps: $spaceIds } }
      }
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        fromEntity {
          ${exploreCardNodeFields(FRAGMENT, { scopeListsToSpaces: false })}
        }
      }
    }
  }
`;

/** Exported for the test that holds it to the same per-entity selection the explore feed uses. */
export const topicCoverageDocument = parse(TOPIC_COVERAGE_SOURCE) as TypedDocumentNode<any, any>;

export type TopicCoveragePage = {
  /** Card rows, still missing the parts only a space lookup can answer. */
  rows: ExploreFeedRow[];
  endCursor: string | null;
  hasNextPage: boolean;
};

const EMPTY_PAGE: TopicCoveragePage = { rows: [], endCursor: null, hasNextPage: false };

type CoverageResponse = {
  relationsConnection?: {
    pageInfo?: { hasNextPage?: boolean | null; endCursor?: string | null } | null;
    nodes?: ({ fromEntity?: unknown } | null)[] | null;
  } | null;
};

function decodeCoverage(response: CoverageResponse): TopicCoveragePage {
  const connection = response.relationsConnection;

  const entities: ExploreCardEntity[] = [];
  for (const node of connection?.nodes ?? []) {
    const decoded = decodeExploreCardEntity(node?.fromEntity);
    if (decoded) entities.push(decoded);
  }

  // The spaces these rows themselves named, which is the only space list this query can have. It
  // makes the builder prefer a space a reader can actually open over whichever the entity happened
  // to list first — the same preference the old hand-rolled row expressed as `find(validateSpaceId)`.
  const openableSpaceIds = new Set(
    entities.flatMap(entity => entity.spaces.filter(validateSpaceId).map(normId))
  );

  return {
    // No member/editor spaces: Coverage has no membership context, and the card is rendered with
    // its Join button hidden rather than shown in a state this query cannot determine.
    rows: buildExploreFeedRows(entities, openableSpaceIds, new Set()),
    endCursor: connection?.pageInfo?.endCursor ?? null,
    hasNextPage: connection?.pageInfo?.hasNextPage ?? false,
  };
}

export function useTopicCoverage({
  topicId,
  first,
  after,
  spaceIds,
}: {
  topicId: string;
  first: number;
  after?: string;
  /** Undefined leaves the query unscoped, which is what the scope hook returns while it resolves. */
  spaceIds?: string[];
}) {
  const { data, isLoading, isPlaceholderData } = useQuery({
    queryKey: ['topic', 'coverage', ID.uuidToHex(topicId), first, after ?? null, spaceIds ?? null],
    queryFn: ({ signal }) =>
      Effect.runPromise(
        graphql({
          query: topicCoverageDocument,
          decoder: decodeCoverage,
          variables: {
            topicsPropertyId: ID.uuidToHex(TOPICS_PROPERTY_ID),
            topicId: ID.uuidToHex(topicId),
            typeIds: COVERAGE_TYPE_IDS.map(ID.uuidToHex),
            spaceIds: spaceIds?.map(ID.uuidToHex),
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

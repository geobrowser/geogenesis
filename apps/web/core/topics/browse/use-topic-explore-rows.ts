'use client';

import * as React from 'react';

import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { DEBATE_CLAIMS_PROPERTY_ID, DEBATE_TYPE_ID } from '~/core/debates/ontology';
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


const FRAGMENT = 'TopicExploreRowsFragment';

/**
 * A topic's linked entities, narrowed by the type of thing pointing at it.
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
const TOPIC_EXPLORE_ROWS_SOURCE = /* GraphQL */ `
  ${exploreCardPropertyFragment(FRAGMENT)}

  query TopicExploreRows(
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
export const topicExploreRowsDocument = parse(TOPIC_EXPLORE_ROWS_SOURCE) as TypedDocumentNode<any, any>;

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
  return decodeConnection(response.relationsConnection, node => node?.fromEntity);
}

/**
 * Rows out of either connection this file asks.
 *
 * `relationsConnection` hands back the entity under `fromEntity`; `entitiesConnection` hands back
 * the entity itself. Everything after that — decoding, choosing an openable space, building the
 * card row — is the same, so it is written once and the difference is the one-line getter.
 */
function decodeConnection(
  connection:
    | { pageInfo?: { endCursor?: string | null; hasNextPage?: boolean | null } | null; nodes?: (any | null)[] | null }
    | null
    | undefined,
  pick: (node: any) => unknown
): TopicCoveragePage {
  const entities: ExploreCardEntity[] = [];
  for (const node of connection?.nodes ?? []) {
    const decoded = decodeExploreCardEntity(pick(node));
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

/**
 * A page of a topic's linked entities, decoded as explore-feed rows.
 *
 * `typeIds` is the only thing that changes between the surfaces built on it: Coverage passes
 * `COVERAGE_TYPE_IDS`, Claims passes the Claim type (GEO-2910). It was hard-coded to coverage
 * when coverage was the only caller — the query always took the variable — and generalising it is
 * what lets the Claims tab render `ExploreFeedCard` rows decoded by this code rather than by a
 * second approximation of it.
 */
export function useTopicExploreRows({
  topicId,
  typeIds,
  first,
  after,
  spaceIds,
  enabled = true,
}: {
  topicId: string;
  /** The kinds of thing pointing at the topic. */
  typeIds: string[];
  first: number;
  after?: string;
  /** Undefined leaves the query unscoped, which is what the scope hook returns while it resolves. */
  spaceIds?: string[];
  enabled?: boolean;
}) {
  const { data, isLoading, isPlaceholderData } = useQuery({
    enabled,
    queryKey: ['topic', 'explore-rows', ID.uuidToHex(topicId), typeIds, first, after ?? null, spaceIds ?? null],
    queryFn: ({ signal }) =>
      Effect.runPromise(
        graphql({
          query: topicExploreRowsDocument,
          decoder: decodeCoverage,
          variables: {
            topicsPropertyId: ID.uuidToHex(TOPICS_PROPERTY_ID),
            topicId: ID.uuidToHex(topicId),
            typeIds: typeIds.map(ID.uuidToHex),
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

/**
 * The same page, accumulated — what the Claims and Coverage tabs scroll through.
 *
 * A real infinite query rather than a stack of single-page hooks: the rows are one list to the
 * reader, so they should be one list in the cache too. `getNextPageParam` reads the cursor the
 * server just handed back, which is the only place the next page's identity exists.
 *
 * No `placeholderData` here. Holding the previous data matters when a pager *replaces* the page
 * under the reader; appending never removes what is on screen, so there is nothing to hold.
 */
export function useTopicExploreRowsInfinite({
  topicId,
  typeIds,
  first,
  spaceIds,
  enabled = true,
}: {
  topicId: string;
  typeIds: string[];
  first: number;
  spaceIds?: string[];
  enabled?: boolean;
}) {
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['topic', 'explore-rows', 'infinite', ID.uuidToHex(topicId), typeIds, first, spaceIds ?? null],
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      Effect.runPromise(
        graphql({
          query: topicExploreRowsDocument,
          decoder: decodeCoverage,
          variables: {
            topicsPropertyId: ID.uuidToHex(TOPICS_PROPERTY_ID),
            topicId: ID.uuidToHex(topicId),
            typeIds: typeIds.map(ID.uuidToHex),
            spaceIds: spaceIds?.map(ID.uuidToHex),
            first,
            after: pageParam,
          },
          signal,
        })
      ),
    getNextPageParam: last => (last.hasNextPage ? (last.endCursor ?? undefined) : undefined),
    staleTime: 30_000,
  });

  const rows = React.useMemo(() => (data?.pages ?? []).flatMap(page => page.rows), [data?.pages]);

  return { rows, isLoading, hasNextPage: Boolean(hasNextPage), fetchNextPage, isFetchingNextPage };
}

const DEBATE_FRAGMENT = 'TopicDebateRowsFragment';

/**
 * The debates argued on a topic's claims, as explore-feed rows.
 *
 * A Debate carries `Claims` and never `Topics`, so reaching one from a topic is two hops. The
 * section used to walk them in two requests: fetch the topic's claims, then ask which debates name
 * any of those ids — with a `CLAIMS_CONSIDERED = 100` cap on the first, because a query listing
 * every claim id of a 2,221-claim topic would be enormous. That cap put 95% of some topics out of
 * reach of their own Debates section.
 *
 * Expressed as a nested filter instead, the whole thing is one request and there is nothing to cap:
 * the server walks debate → claim → topic itself. It is the same filter the tab counts use, which
 * is why the count and the list can finally agree (GEO-2910).
 *
 * `entitiesConnection` rather than relations, for the reason the count already documents: one
 * debate arguing three of a topic's claims is three `Claims` relations, and a relation-shaped query
 * would list it three times.
 */
const TOPIC_DEBATE_ROWS_SOURCE = /* GraphQL */ `
  ${exploreCardPropertyFragment(DEBATE_FRAGMENT)}

  query TopicDebateRows(
    $topicsPropertyId: UUID!
    $topicId: UUID!
    $debate: [UUID!]
    $debateClaimsPropertyId: UUID!
    $spaceIds: [UUID!]
    $first: Int
    $after: Cursor
  ) {
    entitiesConnection(
      first: $first
      after: $after
      orderBy: UPDATED_AT_DESC
      filter: {
        typeIds: { overlaps: $debate }
        spaceIds: { overlaps: $spaceIds }
        relations: {
          some: {
            typeId: { is: $debateClaimsPropertyId }
            toEntity: { relations: { some: { typeId: { is: $topicsPropertyId }, toEntityId: { is: $topicId } } } }
          }
        }
      }
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ${exploreCardNodeFields(DEBATE_FRAGMENT, { scopeListsToSpaces: false })}
      }
    }
  }
`;

/** Exported for the test that holds it to the explore feed's own per-entity selection. */
export const topicDebateRowsDocument = parse(TOPIC_DEBATE_ROWS_SOURCE) as TypedDocumentNode<any, any>;

export function useTopicDebateRowsInfinite({
  topicId,
  first,
  spaceIds,
  enabled = true,
}: {
  topicId: string;
  first: number;
  spaceIds?: string[];
  enabled?: boolean;
}) {
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['topic', 'debate-rows', 'infinite', ID.uuidToHex(topicId), first, spaceIds ?? null],
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      Effect.runPromise(
        graphql({
          query: topicDebateRowsDocument,
          decoder: (response: { entitiesConnection?: any }) =>
            decodeConnection(response.entitiesConnection, node => node),
          variables: {
            topicsPropertyId: ID.uuidToHex(TOPICS_PROPERTY_ID),
            topicId: ID.uuidToHex(topicId),
            debate: [ID.uuidToHex(DEBATE_TYPE_ID)],
            debateClaimsPropertyId: ID.uuidToHex(DEBATE_CLAIMS_PROPERTY_ID),
            spaceIds: spaceIds?.map(ID.uuidToHex),
            first,
            after: pageParam,
          },
          signal,
        })
      ),
    getNextPageParam: last => (last.hasNextPage ? (last.endCursor ?? undefined) : undefined),
    staleTime: 30_000,
  });

  const rows = React.useMemo(() => (data?.pages ?? []).flatMap(page => page.rows), [data?.pages]);

  return { rows, isLoading, hasNextPage: Boolean(hasNextPage), fetchNextPage, isFetchingNextPage };
}

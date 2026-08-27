import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { CLAIM_IS_FACTUAL_PROPERTY_ID, CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { graphql } from '~/core/io/graphql-client';

import type { ClaimPickerEntity } from './claim-picker-page';

/**
 * GEO-2704. The tail of a claim list, from the knowledge graph.
 *
 * Both pickers list claims from geo-chat's `/matchmaking/claims`, for a reason that was true when
 * it was written: a KG scan over every Claim entity in a space 504s, and geo-chat had them indexed.
 * What that traded away was coverage — a claim geo-chat has no row for cannot be listed, however
 * plainly it exists on Geo.
 *
 * This does not replace that list. It continues it: once geo-chat has no next page, the graph is
 * asked for claims matching the same filters, minus the ones already on screen. So the list is
 * geo-chat's for as long as geo-chat has anything to say — its ordering, its readiness, its
 * session exclusions all intact — and the graph only supplies what geo-chat never knew about.
 *
 * Appending rather than merging is deliberate. The two are ordered by different things (presence
 * and positions there, ranking score here), and interleaving them would produce a sequence that
 * answers to neither. A seam at the end of geo-chat's rows is easier to reason about than a
 * shuffle throughout.
 *
 * `entities_ranked_for_feed` is what lets the graph answer at all: the function behind Explore's
 * "Best" sort, an index-ordered walk that stops once the page is full rather than the scan that
 * timed out.
 */
const GRAPH_CLAIMS_SOURCE = /* GraphQL */ `
  query DebateGraphClaims(
    $first: Int!
    $after: Cursor
    $claimTypeId: UUID!
    $spaceIds: [UUID!]
    $filter: EntityFilter
    $propertyIds: [UUID!]!
    $topicsPropertyId: UUID!
  ) {
    entitiesRankedForFeedConnection(
      first: $first
      after: $after
      spaceIds: $spaceIds
      typeIds: [$claimTypeId]
      filter: $filter
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        name
        description
        spaceIds
        valuesList(first: 100, filter: { propertyId: { in: $propertyIds } }) {
          spaceId
          propertyId
          text
          boolean
        }
        relationsList(first: 100, filter: { typeId: { is: $topicsPropertyId } }) {
          toEntity {
            id
            name
          }
        }
      }
    }
  }
`;

type GraphClaimsQueryResult = {
  entitiesRankedForFeedConnection: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null } | null;
    nodes: Array<{
      id: string;
      name: string | null;
      description: string | null;
      spaceIds: string[] | null;
      valuesList: Array<{
        spaceId: string;
        propertyId: string;
        text: string | null;
        boolean: boolean | null;
      } | null> | null;
      relationsList: Array<{ toEntity: { id: string; name: string | null } | null } | null> | null;
    } | null> | null;
  } | null;
};

type EntityFilter = Record<string, unknown>;

type GraphClaimsVariables = {
  first: number;
  after: string | null;
  claimTypeId: string;
  spaceIds: string[] | null;
  filter: EntityFilter | null;
  propertyIds: string[];
  topicsPropertyId: string;
};

const graphClaimsDocument = parse(GRAPH_CLAIMS_SOURCE) as TypedDocumentNode<
  GraphClaimsQueryResult,
  GraphClaimsVariables
>;

/**
 * What the tail asks for at a time.
 *
 * Larger than geo-chat's page: a page here costs one indexed walk, and callers then drop rows that
 * fail their space gates — so a small page can arrive empty and spend a round trip saying nothing.
 */
export const GRAPH_CLAIMS_PAGE_SIZE = 50;

/**
 * How many already-shown claims are excluded server-side.
 *
 * Exclusion belongs in the query rather than after it: geo-chat orders by presence and this orders
 * by ranking score, so the overlap is scattered through the graph's order rather than sitting at
 * the front of it. Filtering a fetched page instead would leave pages that arrive mostly empty and
 * no way to tell that from the end of the list.
 *
 * Bounded because the ids ride in the query string. Beyond this the caller filters what it gets,
 * accepting the short pages — a list this long has already given the viewer far more than they
 * are going to read.
 */
export const GRAPH_CLAIMS_MAX_EXCLUSIONS = 1_000;

export type GraphClaimsQuery = {
  /**
   * The spaces the viewer may be shown claims from. `null` means unnarrowed, which is not the same
   * as `[]` — an empty list is a scope that admits nothing, and sending no ids would fetch the
   * whole corpus instead. Callers with an empty eligible set should not ask at all.
   */
  spaceIds: string[] | null;
  topicId?: string | null;
  /**
   * Claims already on screen from geo-chat, so the tail never repeats one.
   *
   * Note there is no `search` here. A substring filter over the ranking walk measured at ten
   * seconds — it has to walk a very long way to find few rows — so a searching viewer gets
   * geo-chat's answer alone for now. The indexed REST `/search` endpoint is the way in, and it is
   * a separate fetch path rather than a parameter on this one.
   */
  excludeIds?: string[];
};

export type GraphClaimsPage = {
  /** The picker's own projection, so `claimHomeSpaceId` and `claimResponseKind` work unchanged. */
  claims: ClaimPickerEntity[];
  endCursor: string | null;
  hasNextPage: boolean;
};

/**
 * `entities_ranked_for_feed` already excludes system entities, block types and unnamed rows, so
 * this carries only what the *caller* is narrowing by. Left `null` when there is nothing to add:
 * the function's fast path is an index walk, and a filter that matches everything still costs a
 * predicate per row.
 */
export function buildGraphClaimsFilter(query: GraphClaimsQuery): EntityFilter | null {
  const clauses: EntityFilter[] = [];

  if (query.topicId) {
    clauses.push({
      relations: { some: { typeId: { is: TOPICS_PROPERTY_ID }, toEntityId: { is: query.topicId } } },
    });
  }

  const excluded = (query.excludeIds ?? []).slice(0, GRAPH_CLAIMS_MAX_EXCLUSIONS);
  if (excluded.length > 0) {
    clauses.push({ id: { notIn: excluded } });
  }

  if (clauses.length === 0) return null;
  return clauses.length === 1 ? clauses[0]! : { and: clauses };
}

function decodeGraphClaimsPage(data: GraphClaimsQueryResult): GraphClaimsPage {
  const connection = data.entitiesRankedForFeedConnection;
  const claims: ClaimPickerEntity[] = [];

  for (const node of connection?.nodes ?? []) {
    if (!node) continue;
    claims.push({
      id: node.id,
      name: node.name,
      description: node.description,
      spaces: node.spaceIds ?? [],
      values: (node.valuesList ?? []).flatMap(value => {
        if (!value) return [];
        // Match `Entity`'s decoding: booleans land as '1' / '0', text as itself.
        const decoded = value.boolean !== null ? (value.boolean ? '1' : '0') : value.text;
        if (decoded === null) return [];
        return [{ property: { id: value.propertyId }, spaceId: value.spaceId, value: decoded }];
      }),
      relations: (node.relationsList ?? []).flatMap(relation =>
        relation?.toEntity
          ? [{ type: { id: TOPICS_PROPERTY_ID }, toEntity: { id: relation.toEntity.id, name: relation.toEntity.name } }]
          : []
      ),
    });
  }

  return {
    claims,
    endCursor: connection?.pageInfo?.endCursor ?? null,
    hasNextPage: connection?.pageInfo?.hasNextPage ?? false,
  };
}

export function fetchGraphClaims(
  query: GraphClaimsQuery,
  after: string | null,
  signal?: AbortSignal
): Promise<GraphClaimsPage> {
  return Effect.runPromise(
    graphql({
      query: graphClaimsDocument,
      decoder: decodeGraphClaimsPage,
      variables: {
        first: GRAPH_CLAIMS_PAGE_SIZE,
        after,
        claimTypeId: CLAIM_TYPE_ID,
        spaceIds: query.spaceIds,
        filter: buildGraphClaimsFilter(query),
        propertyIds: [SystemIds.NAME_PROPERTY, CLAIM_IS_FACTUAL_PROPERTY_ID],
        topicsPropertyId: TOPICS_PROPERTY_ID,
      },
      signal,
    })
  );
}

/**
 * Deliberately not under `'debates'`, for the same reason as the claim picker's and the featured
 * list's keys: that root is what the gateway reconciles and refetches on every (re)connect, and
 * these rows come from the knowledge graph rather than geo-chat, so a socket event says nothing
 * about them.
 *
 * The exclusions are deliberately *not* in the key. They grow as geo-chat's own list pages, and
 * keying on them would throw the tail away and refetch it every time the head got longer — while
 * the answer barely changes, since anything newly excluded was already filtered out of what the
 * caller is showing.
 */
export const graphClaimsQueryKey = (query: GraphClaimsQuery) =>
  ['graph-claims', query.spaceIds?.join(',') ?? null, query.topicId ?? null] as const;

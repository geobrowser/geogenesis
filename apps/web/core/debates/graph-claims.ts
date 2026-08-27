import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { CLAIM_IS_FACTUAL_PROPERTY_ID, CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { graphql } from '~/core/io/graphql-client';

import type { ClaimPickerEntity } from './claim-picker-page';

/**
 * GEO-2704. Claim discovery, straight from the knowledge graph.
 *
 * Both pickers used to get their lists from geo-chat's `/matchmaking/claims`, for a reason that was
 * true when it was written: a KG scan over every Claim entity in a space 504s, and geo-chat had
 * them indexed. What that traded away was coverage — a claim geo-chat has no row for cannot be
 * listed, however plainly it exists on Geo — and it left the two surfaces disagreeing, since
 * Featured reads the graph and everything else read geo-chat.
 *
 * `entities_ranked_for_feed` is what makes the graph answer this now. It is the same function
 * behind Explore's "Best" sort: an index-ordered walk that stops once `first` rows are found,
 * rather than the scan that timed out. Space and type scoping are its own arguments, and a topic or
 * a name search rides along in `filter`.
 *
 * geo-chat is still asked about these claims — for sides, readiness and presence, which are its
 * data and nobody else's. This module answers only *which claims exist*.
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
 * What the pickers ask for at a time.
 *
 * Deliberately larger than geo-chat's page: a page here costs one indexed walk, and both surfaces
 * then drop rows that fail their space gates — so a small page can arrive empty and spend a round
 * trip saying nothing.
 */
export const GRAPH_CLAIMS_PAGE_SIZE = 50;

export type GraphClaimsQuery = {
  /**
   * The spaces the viewer may be shown claims from. `null` means unnarrowed, which is not the same
   * as `[]` — an empty list is a scope that admits nothing, and sending no ids would fetch the
   * whole corpus instead. Callers with an empty eligible set should not ask at all.
   */
  spaceIds: string[] | null;
  topicId?: string | null;
  search?: string | null;
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

  // Substring rather than the fuzzy `/search` endpoint: that one ranks by its own relevance and
  // returns entities, which would fight the ranking this list is ordered by. A claim is a sentence,
  // and the box above it is filtering a list rather than searching the graph.
  if (query.search) {
    clauses.push({ name: { includesInsensitive: query.search } });
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
 */
export const graphClaimsQueryKey = (query: GraphClaimsQuery) =>
  ['graph-claims', query.spaceIds?.join(',') ?? null, query.topicId ?? null, query.search ?? null] as const;

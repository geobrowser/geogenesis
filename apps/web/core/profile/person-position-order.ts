import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { SCORE_SYSTEM_PROPERTY } from '~/core/constants';
import { ID } from '~/core/id';
import { graphql } from '~/core/io/graphql-client';
import { normId } from '~/core/utils/norm-id';

/**
 * The order a person's claims are read in, as a complete list of ids (GEO-2918).
 *
 * One list per sort, fetched whole. That is the shape the filters need: the
 * control row narrows the *record*, so the ordering and the narrowing have to
 * meet over everything rather than over the pages that happen to be on screen.
 * The cards are still fetched twenty at a time — it is the id list that is
 * complete, and ids are cheap. 214 rows and 208 respectively on the reference
 * account: one request each.
 *
 * The two sorts cannot come from one connection, and this is the fact that
 * shapes the whole tab:
 *
 * - **New** is *when this person voted*, which only the vote table knows.
 *   `EntitiesOrderBy` has 961 values and not one of them orders by somebody's
 *   vote; `CREATED_AT` is the claim's own age, which is a different list.
 * - **Top** is the claim's Score, which the vote table cannot see —
 *   `UserVotesOrderBy` holds vote columns only.
 *
 * Both are voter-scoped server-side (GEO-2913, GEO-2928), so neither is a scan
 * of the graph narrowed afterwards.
 */
export type PositionSort = 'new' | 'top';

const VOTE_ORDER_SOURCE = /* GraphQL */ `
  query PersonVoteOrder($userId: UUID!, $first: Int, $after: Cursor) {
    userVotesConnection(
      first: $first
      after: $after
      orderBy: VOTED_AT_DESC
      filter: { userId: { is: $userId }, or: [{ voteKind: { is: 1 } }, { voteKind: { is: 2 } }] }
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        objectId
        voteType
        voteKind
      }
    }
  }
`;

/**
 * Score order, with the unscored included.
 *
 * `includeWithoutValue` is doing the real work and is not optional: only 37 of
 * the reference account's 208 claims carry a Score at all, so dropping it turns
 * "Top" into "the 37 scored ones" — a list 82% shorter than the count beside it.
 *
 * No `spaceIds`, deliberately. That argument used to be required alongside the
 * flag, which would have meant learning the person's spaces before the first
 * page could render; GEO-2928 made `votedBy` satisfy the same constraint.
 */
const SCORE_ORDER_SOURCE = /* GraphQL */ `
  query PersonScoreOrder($userId: UUID!, $propertyId: UUID!, $first: Int, $after: Cursor) {
    entitiesOrderedByPropertyConnection(
      votedBy: $userId
      votedByKinds: [1, 2]
      propertyId: $propertyId
      dataType: "integer"
      sortDirection: DESC
      includeWithoutValue: true
      first: $first
      after: $after
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
      }
    }
  }
`;

export const personVoteOrderDocument = parse(VOTE_ORDER_SOURCE) as TypedDocumentNode<any, any>;
export const personScoreOrderDocument = parse(SCORE_ORDER_SOURCE) as TypedDocumentNode<any, any>;

const ORDER_PAGE_SIZE = 500;

/** Bounds the request count, not the answer. Matches the index's ceiling. */
const ORDER_MAX_PAGES = 20;

/** Which way somebody came down on a claim. */
export type Stance = 'agree' | 'disagree';

export type PositionOrder = {
  /** Claim ids, deduped, in the order this sort puts them. Normalised. */
  entityIds: string[];
  /** Absent for a sort that cannot say — only the vote table carries stances. */
  stanceByClaimId: Record<string, Stance>;
};

type VoteNode = { objectId?: string | null; voteType?: number | null; voteKind?: number | null };

/**
 * `voteType` 0 is agree and 1 is disagree; 2 is neither and carries no side.
 *
 * Measured on the reference account: 100 agree, 86 disagree, 4 of the third
 * across 190 stance votes.
 */
export function stanceOf(node: VoteNode): Stance | null {
  if (node.voteType === 0) return 'agree';
  if (node.voteType === 1) return 'disagree';
  return null;
}

/**
 * Vote rows to claim ids, in vote order, one entry per claim.
 *
 * Stance and veracity are separate votes on the same claim, so somebody who
 * cast both would otherwise appear twice in their own record. First seen wins,
 * and the rows arrive newest-first, so the position shown is the current one.
 *
 * Only `voteKind` 1 sets the side. Kind 2 is veracity — a judgement about
 * whether the claim is *true*, which is a different question from whether they
 * agree with it — so a claim rated only for veracity carries no side at all,
 * which is the honest answer rather than a missing one.
 */
export function decodeVoteOrder(nodes: readonly (VoteNode | null)[]): PositionOrder {
  const seen = new Set<string>();
  const entityIds: string[] = [];
  const stanceByClaimId: Record<string, Stance> = {};

  for (const node of nodes) {
    const id = node?.objectId;
    if (!id) continue;
    const key = normId(id);

    if (node.voteKind === 1) {
      const stance = stanceOf(node);
      if (stance && !(key in stanceByClaimId)) stanceByClaimId[key] = stance;
    }

    if (seen.has(key)) continue;
    seen.add(key);
    entityIds.push(key);
  }

  return { entityIds, stanceByClaimId };
}

type Page = { nodes: unknown[]; hasNextPage: boolean; endCursor: string | null };

/** Every page of a connection, by cursor. Offset is rejected above 1000. */
async function pageAll(
  query: TypedDocumentNode<any, any>,
  variables: Record<string, unknown>,
  read: (
    data: any
  ) =>
    | { pageInfo?: { hasNextPage?: boolean | null; endCursor?: string | null } | null; nodes?: unknown[] | null }
    | null
    | undefined,
  signal?: AbortSignal
): Promise<unknown[]> {
  const nodes: unknown[] = [];
  let after: string | null = null;

  for (let page = 0; page < ORDER_MAX_PAGES; page++) {
    const decoded: Page = await Effect.runPromise(
      graphql({
        query,
        decoder: (data: any) => {
          const connection = read(data);
          return {
            nodes: (connection?.nodes ?? []) as unknown[],
            hasNextPage: connection?.pageInfo?.hasNextPage ?? false,
            endCursor: connection?.pageInfo?.endCursor ?? null,
          };
        },
        variables: { ...variables, first: ORDER_PAGE_SIZE, after },
        signal,
      })
    );

    nodes.push(...decoded.nodes);
    if (!decoded.hasNextPage || !decoded.endCursor) break;
    after = decoded.endCursor;
  }

  return nodes;
}

export function personPositionOrderQueryKey(spaceId: string, sort: PositionSort) {
  return ['person-position-order', ID.uuidToHex(spaceId), sort] as const;
}

export async function fetchPositionOrder(
  spaceId: string,
  sort: PositionSort,
  signal?: AbortSignal
): Promise<PositionOrder> {
  const userId = ID.uuidToHex(spaceId);

  if (sort === 'new') {
    const nodes = await pageAll(personVoteOrderDocument, { userId }, data => data.userVotesConnection, signal);
    return decodeVoteOrder(nodes as VoteNode[]);
  }

  const nodes = await pageAll(
    personScoreOrderDocument,
    { userId, propertyId: SCORE_SYSTEM_PROPERTY },
    data => data.entitiesOrderedByPropertyConnection,
    signal
  );

  const seen = new Set<string>();
  const entityIds: string[] = [];

  for (const node of nodes as { id?: string | null }[]) {
    if (!node?.id) continue;
    const key = normId(node.id);
    if (seen.has(key)) continue;
    seen.add(key);
    entityIds.push(key);
  }

  // Score order says nothing about which side anyone took. The tab reads stances
  // from the vote order, which it holds whichever sort is showing.
  return { entityIds, stanceByClaimId: {} };
}

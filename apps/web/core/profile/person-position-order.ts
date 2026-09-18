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
        spaceId
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

/**
 * Bounds the request count. Reaching it throws, matching the index's ceiling.
 *
 * Stopping quietly here would hand the tab a short list it would render as the
 * whole record — the list ending well before the count beside it, with nothing
 * saying why.
 */
const ORDER_MAX_PAGES = 20;

/** Which way somebody came down. `null` where they answered "neither". */
export type Stance = 'agree' | 'disagree';

/**
 * How this person answered a claim, by the question they were answering.
 *
 * **Both kinds, not just the stance.** A claim marked factual asks Verify or
 * Dispute rather than Agree or Disagree, and that answer is a `voteKind` 2 vote
 * — which the stance-only shape threw away, so 18 of the reference account's 208
 * positions had no indicator anywhere and nothing said why. Which one a card
 * shows is the card's to decide: it resolves the claim's response kind itself,
 * and the same claim can be factual in one space and not in another.
 */
export type ClaimResponse = {
  stance?: Stance;
  veracity?: Stance;
};

export type PositionOrder = {
  /**
   * Claim ids, deduped, in the order this sort puts them. Normalised.
   *
   * Claims this person *currently* answers — a retracted one is not in here. See
   * `decodeVoteOrder`.
   */
  entityIds: string[];
  /** Absent for a sort that cannot say — only the vote table carries responses. */
  responseByClaimId: Record<string, ClaimResponse>;
  /**
   * The space each answer was cast in, by claim id.
   *
   * A claim can live in several spaces, and the explore card renders whichever
   * the entity happens to list first — which for two of the claims on the
   * reference account's first screen was somebody's personal space rather than
   * the topic space the claim is actually discussed in. The vote says exactly
   * which one this person was looking at, so the card can be shown there.
   *
   * Empty for a sort that cannot say.
   */
  spaceByClaimId: Record<string, string>;
};

type VoteNode = {
  objectId?: string | null;
  voteType?: number | null;
  voteKind?: number | null;
  spaceId?: string | null;
};

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
 * **Both kinds are kept, apart.** `voteKind` 1 is a stance — do I agree — and 2
 * is veracity — is this true. They are different questions, so they are not
 * merged: a card shows whichever one matches the claim's own response kind, and
 * that kind is a property of the claim *in a space*, which this decode cannot
 * see. Keeping only the stance is what left a claim answered Verify or Dispute
 * with no indicator at all.
 *
 * **A retracted claim is not listed at all.** `voteType` 2 is "neither", and it
 * is not something anybody chooses: the controls offer two sides, and
 * `userVotes` is unique per (user, claim, object type, space, kind), so taking a
 * side back rewrites the row rather than deleting it. The row is what
 * `entitiesConnection(votedBy:)` counts, which is why the tab listed claims with
 * no position on them and the rail counted them — 17 of one account's 211, 12 of
 * another's 34. There is no server-side way to exclude them (`votedByTypes` does
 * not exist), so the vote table is the only source that can tell the difference,
 * and every part of the tab narrows to what it says.
 *
 * The newest vote of each kind settles that kind even when it carries no side,
 * so a retraction cannot be skipped over and let an older answer fill the gap.
 */
export function decodeVoteOrder(nodes: readonly (VoteNode | null)[]): PositionOrder {
  const seen = new Set<string>();
  const order: string[] = [];
  const responseByClaimId: Record<string, ClaimResponse> = {};
  const spaceByClaimId: Record<string, string> = {};
  // Per claim *and kind*: which of the two questions has had its newest answer
  // read. Kept apart from the response itself, which cannot record "answered,
  // with no side".
  const settled = new Set<string>();

  for (const node of nodes) {
    const id = node?.objectId;
    if (!id) continue;
    const key = normId(id);

    const field = node.voteKind === 1 ? 'stance' : node.voteKind === 2 ? 'veracity' : null;
    if (field && !settled.has(`${key}:${field}`)) {
      settled.add(`${key}:${field}`);
      const side = stanceOf(node);

      if (side) {
        responseByClaimId[key] = { ...responseByClaimId[key], [field]: side };
        // From the answer that counts, not from a retraction beside it: somebody
        // who took a stance back in one space and holds one in another should be
        // read in the space they still hold it in.
        if (!spaceByClaimId[key] && node.spaceId) spaceByClaimId[key] = normId(node.spaceId);
      }
    }

    if (seen.has(key)) continue;
    seen.add(key);
    order.push(key);
  }

  // Filtered at the end rather than skipped in the loop: a claim can be answered
  // in one space and retracted in another, and the row order is the vote order
  // — so whether it is still answered is only known once every row is in.
  const entityIds = order.filter(id => responseByClaimId[id] !== undefined);

  return { entityIds, responseByClaimId, spaceByClaimId };
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
    if (page === ORDER_MAX_PAGES - 1) {
      throw new Error(`[position-order] exceeds ${ORDER_MAX_PAGES} pages`);
    }
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

  // Score order says nothing about how anyone answered — including whether the
  // answer still stands. The tab reads both from the vote order, which it holds
  // whichever sort is showing, and narrows this list to it.
  return { entityIds, responseByClaimId: {}, spaceByClaimId: {} };
}

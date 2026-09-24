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
 * - **Best** is the indexer's ranking score, an `EntitiesOrderBy` column rather
 *   than a property — so it comes from the same connection as New, ordered
 *   differently.
 *
 * Both are voter-scoped server-side (GEO-2913, GEO-2928), so neither is a scan
 * of the graph narrowed afterwards.
 */
export type PositionSort = 'new' | 'top' | 'best';

/**
 * What the Positions tab opens on, and what the Activity gallery shows.
 *
 * New, and it means something here that it cannot mean on Debates: the order
 * *this person answered*, read from `userVotesConnection` ordered
 * `VOTED_AT_DESC` — not the order the claims were written, which is a different
 * list (the two share 4 of their top 10 on the reference account).
 *
 * Shared with the gallery for the same reason `DEFAULT_DEBATE_SORT` is: the two
 * surfaces link to each other and must not disagree.
 */
export const DEFAULT_POSITION_SORT: PositionSort = 'new';

const VOTE_ORDER_SOURCE = /* GraphQL */ `
  query PersonVoteOrder($userId: UUID!, $first: Int, $after: Cursor) {
    userVotesConnection(
      first: $first
      after: $after
      orderBy: VOTED_AT_DESC
      filter: { userId: { is: $userId }, voteKind: { is: 1 } }
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

/**
 * Ranking order — the same number Explore's Best shows.
 *
 * Not `entitiesRankedForFeed*`, which is where Best is read from on Explore and
 * has no `votedBy`. It does not need to be: that connection returns its nodes in
 * strictly descending `rankingScore` (25 of 25 checked for the Relationships
 * space), so the ordering *is* this column and the two surfaces agree. Explore's
 * diversity windowing is applied client-side afterwards, in `fetchExploreFeed`,
 * and deliberately not here — it exists to stop one space crowding an infinite
 * feed, which is not a problem one person's record has.
 *
 * Reading the column rather than the ranked connection is also the more complete
 * answer: that connection generates candidates on its own rules and dropped 8 of
 * the reference account's 208 claims, where this returns every one.
 */
const BEST_ORDER_SOURCE = /* GraphQL */ `
  query PersonBestOrder($userId: UUID!, $first: Int, $after: Cursor) {
    entitiesConnection(
      votedBy: $userId
      votedByKinds: [1, 2]
      orderBy: RANKING_SCORE_DESC
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
export const personBestOrderDocument = parse(BEST_ORDER_SOURCE) as TypedDocumentNode<any, any>;
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
 * How this person answered a claim.
 *
 * One field, because there is one question. A claim marked factual used to ask Verify or Dispute
 * rather than Agree or Disagree, and that answer was a `voteKind` 2 vote carried here in a
 * `veracity` field of its own — so that a card could show whichever matched the claim's own
 * vocabulary, which was a per-space property the decode could not see. Claims ask one question
 * now: the stance is the answer, and a kind-2 row is not read at all.
 */
export type ClaimResponse = {
  stance?: Stance;
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
   * The spaces each answer was cast in, by claim id, newest first.
   *
   * A claim can live in several spaces, and the explore card renders whichever
   * the entity happens to list first — which for two of the claims on the
   * reference account's first screen was somebody's personal space rather than
   * the topic space the claim is actually discussed in. The vote says which ones
   * this person was actually looking at.
   *
   * A list rather than one space, because somebody can answer the same claim in
   * two spaces: 1 of the reference account's 59. Taking the newest picked the
   * personal-space copy, which carries no Claim type and so rendered as a
   * generic card with no response controls at all. All the candidates go to
   * `pickDisplaySpaceId`, which prefers the one the claim is really a claim in.
   *
   * Empty for a sort that cannot say.
   */
  spacesByClaimId: Record<string, string[]>;
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
 * The same claim answered in two spaces is two rows, so somebody would otherwise
 * appear twice in their own record. First seen wins, and the rows arrive
 * newest-first, so the position shown is the current one.
 *
 * **One kind.** `voteKind` 1 is a stance — do I agree — and it is the only
 * question a claim asks. Kind 2 was veracity, a separate vote asking whether the
 * claim was true; it was decoded into a field of its own here so that a card
 * could show whichever matched the claim's own vocabulary. Claims have one
 * vocabulary now and nothing reads that field, so a kind-2 row is no longer an
 * answer to anything this list can render.
 *
 * **A retracted claim is not listed at all.** `voteType` 2 is "neither", and it
 * is not something anybody chooses: the controls offer two sides, and
 * `userVotes` is unique per (user, claim, object type, space, kind), so taking a
 * side back rewrites the row rather than deleting it. The row is what
 * `entitiesConnection(votedBy:)` counts, which is why the tab listed claims with
 * no position on them and the rail counted them — 17 of one account's 211, 12 of
 * another's 34, 50 across the 20 accounts measured. There is no server-side way
 * to exclude them today (`votedByTypes` does not exist; GEO-2962 asks for it),
 * so the vote table is the only source that can tell the difference, and every
 * part of the tab narrows to what it says.
 *
 * The newest vote of each kind settles that kind even when it carries no side,
 * so a retraction cannot be skipped over and let an older answer fill the gap —
 * **within a space.** A position is held per space, and the two are independent:
 * retracting in one place says nothing about a position still held in another.
 * Keyed without the space, the newest row anywhere settled the kind everywhere,
 * so a claim agreed in Relationships and later retracted in a personal space
 * vanished from the list and from the count. Nobody in the graph has done that
 * yet — 0 of the 20 accounts measured — so this was latent rather than visible.
 */
export function decodeVoteOrder(nodes: readonly (VoteNode | null)[]): PositionOrder {
  const seen = new Set<string>();
  const order: string[] = [];
  const responseByClaimId: Record<string, ClaimResponse> = {};
  const spacesByClaimId: Record<string, string[]> = {};
  // Per claim, kind *and space*: which question has had its newest answer read,
  // where it was asked. Kept apart from the response itself, which cannot record
  // "answered, with no side".
  const settled = new Set<string>();

  for (const node of nodes) {
    const id = node?.objectId;
    if (!id) continue;
    const key = normId(id);

    // Kind 2 — the retired veracity response — is not an answer any more. It used to decode into a
    // `veracity` field of its own, and with that field gone a claim answered only that way would
    // still enter the list while rendering no verdict under either button: a record of attention
    // with the verdict left out, which is the one thing this list exists to report.
    const field = node.voteKind === 1 ? 'stance' : null;
    const settledKey = `${key}:${field}:${node.spaceId ? normId(node.spaceId) : ''}`;

    if (field && !settled.has(settledKey)) {
      settled.add(settledKey);
      const side = stanceOf(node);

      if (side) {
        responseByClaimId[key] = { ...responseByClaimId[key], [field]: side };

        // From the answers that count, not from a retraction beside them:
        // somebody who took a stance back in one space and holds one in another
        // is read in the space they still hold it in. Reachable because
        // `settled` carries the space — it was not, before.
        if (node.spaceId) {
          const space = normId(node.spaceId);
          const spaces = (spacesByClaimId[key] ??= []);
          if (!spaces.includes(space)) spaces.push(space);
        }
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

  return { entityIds, responseByClaimId, spacesByClaimId };
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

  const nodes =
    sort === 'best'
      ? await pageAll(personBestOrderDocument, { userId }, data => data.entitiesConnection, signal)
      : await pageAll(
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

  // Neither ordering says anything about how anyone answered — including
  // whether the answer still stands. The tab reads both from the vote order,
  // which it holds whichever sort is showing, and narrows this list to it.
  return { entityIds, responseByClaimId: {}, spacesByClaimId: {} };
}

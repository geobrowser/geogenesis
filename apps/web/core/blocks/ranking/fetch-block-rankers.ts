import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { graphql } from '~/core/io/graphql-client';
import { RANK_TYPE_ID, RANK_VOTES_RELATION_TYPE_ID, SUBMITTED_TO_PROPERTY_ID } from '~/core/ranking-block-ids';
import { type CursorPage, collectCursorPages } from '~/core/sync/collect-cursor-pages';
import { mapWithConcurrency } from '~/core/utils/map-with-concurrency';
import { normId } from '~/core/utils/norm-id';

import {
  type BlockRankersSummary,
  type RankBallot,
  type RankBallotHead,
  type RankBallotItem,
  selectCountingBallots,
  summarizeBlockRankers,
} from './block-rankers';

/**
 * The reads behind `useBlockRankers` (GEO-3686): every ballot submitted to a ranking block, the
 * block space's members and editors, and the items of the ballots that count.
 *
 * Every list is a cursor walk. A Best debates ballot can hold 2,000 items and the API caps both
 * `first` and offsets at 1,000, so a capped or offset read would silently drop the tail of a
 * ballot and undercount every debate in it. A broken cursor chain throws (see
 * `collectCursorPages`) rather than returning a plausible partial count.
 */

/** The API's per-request cap. */
export const BLOCK_RANKERS_PAGE_SIZE = 1000;

/** Ballot item walks run in parallel, one walk per ballot, capped so a busy block can't burst. */
export const BALLOT_ITEMS_CONCURRENCY = 6;

export type MembershipKind = 'members' | 'editors';

/** One page of each read. Injectable, so tests and measurements can run without the network. */
export type BlockRankersPageFetchers = {
  ballotHeads: (blockId: string, after: string | undefined) => Promise<CursorPage<RankBallotHead>>;
  membership: (kind: MembershipKind, spaceId: string, after: string | undefined) => Promise<CursorPage<string>>;
  ballotItems: (
    rankEntityId: string,
    authorSpaceId: string,
    after: string | undefined
  ) => Promise<CursorPage<RankBallotItem>>;
};

type PageInfo = { hasNextPage: boolean; endCursor: string | null };

const BALLOT_HEADS_SOURCE = /* GraphQL */ `
  query BlockRankerBallotHeads($blockId: UUID!, $typeId: UUID!, $first: Int!, $after: Cursor) {
    relationsConnection(
      first: $first
      after: $after
      filter: { typeId: { is: $typeId }, toEntityId: { is: $blockId } }
    ) {
      nodes {
        fromEntityId
        spaceId
        fromEntity {
          typeIds
          createdAt
          updatedAt
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

type BallotHeadsQuery = {
  relationsConnection: {
    nodes: Array<{
      fromEntityId: string | null;
      spaceId: string | null;
      fromEntity: {
        typeIds: string[] | null;
        createdAt: string | null;
        updatedAt: string | null;
      } | null;
    } | null>;
    pageInfo: PageInfo;
  } | null;
};

const ballotHeadsDocument = parse(BALLOT_HEADS_SOURCE) as TypedDocumentNode<
  BallotHeadsQuery,
  { blockId: string; typeId: string; first: number; after: string | null }
>;

// Hand-written queries, so codegen can't check them: `spaceId` is a UUID column and must be typed
// `UUID!` or the request fails validation before it runs.
const MEMBERS_SOURCE = /* GraphQL */ `
  query BlockRankerMembers($spaceId: UUID!, $first: Int!, $after: Cursor) {
    membersConnection(first: $first, after: $after, filter: { spaceId: { is: $spaceId } }) {
      nodes {
        memberSpaceId
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const EDITORS_SOURCE = /* GraphQL */ `
  query BlockRankerEditors($spaceId: UUID!, $first: Int!, $after: Cursor) {
    editorsConnection(first: $first, after: $after, filter: { spaceId: { is: $spaceId } }) {
      nodes {
        memberSpaceId
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

type MembershipConnection = { nodes: Array<{ memberSpaceId: string | null } | null>; pageInfo: PageInfo } | null;
type MembershipVariables = { spaceId: string; first: number; after: string | null };

const membersDocument = parse(MEMBERS_SOURCE) as TypedDocumentNode<
  { membersConnection: MembershipConnection },
  MembershipVariables
>;
const editorsDocument = parse(EDITORS_SOURCE) as TypedDocumentNode<
  { editorsConnection: MembershipConnection },
  MembershipVariables
>;

const BALLOT_ITEMS_SOURCE = /* GraphQL */ `
  query BlockRankerBallotItems($rankEntityId: UUID!, $spaceId: UUID!, $typeId: UUID!, $first: Int!, $after: Cursor) {
    relationsConnection(
      first: $first
      after: $after
      filter: { fromEntityId: { is: $rankEntityId }, spaceId: { is: $spaceId }, typeId: { is: $typeId } }
    ) {
      nodes {
        toEntityId
        position
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

type BallotItemsQuery = {
  relationsConnection: {
    nodes: Array<{ toEntityId: string | null; position: string | null } | null>;
    pageInfo: PageInfo;
  } | null;
};

const ballotItemsDocument = parse(BALLOT_ITEMS_SOURCE) as TypedDocumentNode<
  BallotItemsQuery,
  { rankEntityId: string; spaceId: string; typeId: string; first: number; after: string | null }
>;

/** The API serves entity times as unix seconds; tolerate ms and ISO strings too. */
export function timestampToMs(value: string | number | null | undefined): number {
  if (value == null || value === '') return 0;
  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) return asNumber < 1_000_000_000_000 ? asNumber * 1000 : asNumber;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? 0 : parsed;
}

const rankTypeKey = normId(RANK_TYPE_ID);

/** A SUBMITTED_TO relation row as a ballot head, or null when it isn't from a Rank entity. */
export function decodeBallotHead(
  node: NonNullable<NonNullable<BallotHeadsQuery['relationsConnection']>['nodes'][number]>
): RankBallotHead | null {
  if (!node.fromEntityId || !node.spaceId || !node.fromEntity) return null;
  if (!(node.fromEntity.typeIds ?? []).some(typeId => normId(typeId) === rankTypeKey)) return null;
  return {
    rankEntityId: node.fromEntityId,
    authorSpaceId: node.spaceId,
    createdAtMs: timestampToMs(node.fromEntity.createdAt),
    updatedAtMs: timestampToMs(node.fromEntity.updatedAt),
  };
}

function connectionPage<TNode, TItem>(
  connection: { nodes: Array<TNode | null>; pageInfo: PageInfo } | null,
  decode: (node: TNode) => TItem | null
): CursorPage<TItem> {
  return {
    items: (connection?.nodes ?? []).flatMap(node => {
      if (!node) return [];
      const item = decode(node);
      return item == null ? [] : [item];
    }),
    endCursor: connection?.pageInfo.endCursor ?? null,
    hasNextPage: connection?.pageInfo.hasNextPage ?? false,
  };
}

/**
 * Runs one query document. The default goes through the app's GraphQL client (with its retries);
 * the opt-in live check passes a bare HTTPS request instead, since tests refuse `fetch`.
 */
export type BlockRankersRequest = <TData, TVariables extends Record<string, unknown>>(
  document: TypedDocumentNode<TData, TVariables>,
  variables: TVariables
) => Promise<TData>;

const appGraphRequest: BlockRankersRequest = (document, variables) =>
  Effect.runPromise(graphql({ query: document, variables, decoder: data => data }));

const decodeMember = (node: { memberSpaceId: string | null }) => node.memberSpaceId;

export function createBlockRankersPageFetchers(
  request: BlockRankersRequest = appGraphRequest
): BlockRankersPageFetchers {
  return {
    ballotHeads: async (blockId, after) => {
      const data = await request(ballotHeadsDocument, {
        blockId,
        typeId: SUBMITTED_TO_PROPERTY_ID,
        first: BLOCK_RANKERS_PAGE_SIZE,
        after: after ?? null,
      });
      return connectionPage(data.relationsConnection, decodeBallotHead);
    },
    membership: async (kind, spaceId, after) => {
      const variables = { spaceId, first: BLOCK_RANKERS_PAGE_SIZE, after: after ?? null };
      if (kind === 'members') {
        return connectionPage((await request(membersDocument, variables)).membersConnection, decodeMember);
      }
      return connectionPage((await request(editorsDocument, variables)).editorsConnection, decodeMember);
    },
    ballotItems: async (rankEntityId, authorSpaceId, after) => {
      const data = await request(ballotItemsDocument, {
        rankEntityId,
        spaceId: authorSpaceId,
        typeId: RANK_VOTES_RELATION_TYPE_ID,
        first: BLOCK_RANKERS_PAGE_SIZE,
        after: after ?? null,
      });
      return connectionPage(data.relationsConnection, node =>
        node.toEntityId ? { entityId: node.toEntityId, position: node.position ?? null } : null
      );
    },
  };
}

export const graphBlockRankersPageFetchers = createBlockRankersPageFetchers();

/** Personal space ids (normalized) of the space's members and editors. */
export async function fetchMembersAndEditors(
  spaceId: string,
  fetchers: Pick<BlockRankersPageFetchers, 'membership'> = graphBlockRankersPageFetchers
): Promise<Set<string>> {
  const [members, editors] = await Promise.all(
    (['members', 'editors'] as const).map(kind =>
      collectCursorPages(after => fetchers.membership(kind, spaceId, after))
    )
  );
  return new Set([...members, ...editors].map(normId));
}

export type ReadBlockRankersArgs = {
  /** The ranking block entity id. */
  blockId: string;
  /** The space the block lives in; its members and editors are the people who count. */
  spaceId: string;
};

/**
 * Who ranked what on the block, from the ballots the indexer counts.
 *
 * Reads every ballot head and the membership lists in parallel, works out which ballots count, then
 * reads the items of those ballots only (a superseded or non-member ballot's 2,000 items are never
 * fetched). Throws if any read fails: a partial answer would show wrong counts as though right.
 */
export async function readBlockRankers(
  { blockId, spaceId }: ReadBlockRankersArgs,
  fetchers: BlockRankersPageFetchers = graphBlockRankersPageFetchers
): Promise<BlockRankersSummary> {
  const [heads, eligibleSpaceIds] = await Promise.all([
    collectCursorPages(after => fetchers.ballotHeads(blockId, after)),
    fetchMembersAndEditors(spaceId, fetchers),
  ]);

  const counting = selectCountingBallots(heads, eligibleSpaceIds);

  const ballots: RankBallot[] = await mapWithConcurrency(counting, BALLOT_ITEMS_CONCURRENCY, async head => ({
    ...head,
    items: await collectCursorPages(after => fetchers.ballotItems(head.rankEntityId, head.authorSpaceId, after)),
  }));

  return summarizeBlockRankers(ballots, eligibleSpaceIds);
}

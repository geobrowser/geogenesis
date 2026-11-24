import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { ID } from '~/core/id';
import { graphql } from '~/core/io/graphql-client';
import { CLAIM_RESPONSE_KIND, responseKindToVoteKind } from '~/core/responses/entity-response';
import { type CursorPage, collectCursorPages } from '~/core/sync/collect-cursor-pages';

import type { VoteChoice } from '../models';

export type SpaceVoteBucket = {
  spaceId: string;
  positive: number;
  negative: number;
};

export type ClaimMultiSpaceVotes = {
  totalPositive: number;
  totalNegative: number;
  viewerVote: VoteChoice;
  /** The viewer's vote in each space (hex id), so a row voting in one space swaps only that vote. */
  viewerVoteBySpace: Map<string, Exclude<VoteChoice, null>>;
  bySpace: SpaceVoteBucket[];
};

/** One active vote, already de-duplicated to one per (claim, space, voter). Ids are hex. */
export type ActiveClaimVote = { objectHex: string; spaceHex: string; userId: string; isPositive: boolean };

/** A `userVotesConnection` row as the Topic page reads it. */
export type ClaimVoteRow = { userId: string; objectId: string; spaceId: string; voteType: number; voteKind: number };

/** The vote kind an Agree / Disagree on a claim is published as: what the Claim page counts. */
export const CLAIM_STANCE_VOTE_KIND = responseKindToVoteKind(CLAIM_RESPONSE_KIND);

const MULTI_SPACE_CLAIM_VOTES_PAGE_SIZE = 1_000;

const MULTI_SPACE_CLAIM_VOTES_QUERY = parse(/* GraphQL */ `
  query MultiSpaceClaimVotes($objectIds: [UUID!]!, $voteKind: Int!, $first: Int!, $after: Cursor) {
    userVotesConnection(
      first: $first
      after: $after
      filter: {
        objectType: { is: 0 }
        voteKind: { is: $voteKind }
        voteType: { in: [0, 1] }
        objectId: { in: $objectIds }
      }
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        userId
        objectId
        spaceId
        voteType
        voteKind
      }
    }
  }
`) as TypedDocumentNode<
  {
    userVotesConnection?: {
      pageInfo?: { hasNextPage?: boolean | null; endCursor?: string | null } | null;
      nodes?: ClaimVoteRow[] | null;
    } | null;
  },
  { objectIds: string[]; voteKind: number; first: number; after?: string }
>;

type FetchVotePage = (args: {
  objectIds: string[];
  first: number;
  after: string | undefined;
  signal?: AbortSignal;
}) => Promise<CursorPage<ClaimVoteRow>>;

function defaultFetchVotePage({ objectIds, first, after, signal }: Parameters<FetchVotePage>[0]) {
  return Effect.runPromise(
    graphql({
      query: MULTI_SPACE_CLAIM_VOTES_QUERY,
      variables: { objectIds, voteKind: CLAIM_STANCE_VOTE_KIND, first, after },
      decoder: (data): CursorPage<ClaimVoteRow> => ({
        items: data.userVotesConnection?.nodes ?? [],
        endCursor: data.userVotesConnection?.pageInfo?.endCursor ?? null,
        hasNextPage: data.userVotesConnection?.pageInfo?.hasNextPage ?? false,
      }),
      signal,
    })
  );
}

/**
 * Every Agree / Disagree vote row on these claims, in every space, walked to the end of the cursor:
 * totals, the Disputed / Accepted split and the viewer's baseline all derive from these rows.
 */
export function fetchMultiSpaceClaimVoteRows({
  objectIds,
  signal,
  fetchPage = defaultFetchVotePage,
}: {
  objectIds: string[];
  signal?: AbortSignal;
  fetchPage?: FetchVotePage;
}): Promise<ClaimVoteRow[]> {
  if (objectIds.length === 0) return Promise.resolve([]);
  return collectCursorPages(after => fetchPage({ objectIds, first: MULTI_SPACE_CLAIM_VOTES_PAGE_SIZE, after, signal }));
}

/**
 * The Agree / Disagree votes among a claim's vote rows, one per (claim, space, voter).
 *
 * A claim also carries votes of other kinds: an upvote (curation) and the retired Verify / Dispute.
 * Those are not a side, so they are dropped here. Counted as Agree they put the Topic page a vote
 * ahead of the Claim page ("Bitcoin is a better store of value than gold" read 2/2 against 1/2).
 */
export function activeStanceVotes(rows: Iterable<ClaimVoteRow>): ActiveClaimVote[] {
  const byKey = new Map<string, ActiveClaimVote>();
  for (const row of rows) {
    if (row.voteKind !== CLAIM_STANCE_VOTE_KIND) continue;
    if (row.voteType !== 0 && row.voteType !== 1) continue;
    const objectHex = ID.uuidToHex(row.objectId);
    const spaceHex = ID.uuidToHex(row.spaceId);
    byKey.set(`${objectHex}:${spaceHex}:${row.userId}`, {
      objectHex,
      spaceHex,
      userId: row.userId,
      isPositive: row.voteType === 0,
    });
  }
  return [...byKey.values()];
}

/**
 * A Topic page's votes per claim: totals across every space, the split by space, and the viewer's
 * own vote both anywhere and per space.
 */
export function aggregateClaimVotes(
  votes: Iterable<ActiveClaimVote>,
  personalSpaceId: string | null | undefined
): Map<string, ClaimMultiSpaceVotes> {
  const byClaim = new Map<string, ClaimMultiSpaceVotes>();
  const byClaimSpace = new Map<string, Map<string, SpaceVoteBucket>>();

  for (const entry of votes) {
    let claimAgg = byClaim.get(entry.objectHex);
    if (!claimAgg) {
      claimAgg = {
        totalPositive: 0,
        totalNegative: 0,
        viewerVote: null,
        viewerVoteBySpace: new Map(),
        bySpace: [],
      };
      byClaim.set(entry.objectHex, claimAgg);
    }
    if (entry.isPositive) claimAgg.totalPositive += 1;
    else claimAgg.totalNegative += 1;

    if (personalSpaceId && ID.equals(entry.userId, personalSpaceId)) {
      claimAgg.viewerVote = entry.isPositive ? 'agree' : 'disagree';
      claimAgg.viewerVoteBySpace.set(entry.spaceHex, claimAgg.viewerVote);
    }

    let spaceMap = byClaimSpace.get(entry.objectHex);
    if (!spaceMap) {
      spaceMap = new Map();
      byClaimSpace.set(entry.objectHex, spaceMap);
    }
    let bucket = spaceMap.get(entry.spaceHex);
    if (!bucket) {
      bucket = { spaceId: entry.spaceHex, positive: 0, negative: 0 };
      spaceMap.set(entry.spaceHex, bucket);
    }
    if (entry.isPositive) bucket.positive += 1;
    else bucket.negative += 1;
  }

  for (const [claimHex, spaceMap] of byClaimSpace.entries()) {
    const agg = byClaim.get(claimHex);
    if (agg) {
      agg.bySpace = Array.from(spaceMap.values()).sort((a, b) => b.positive + b.negative - (a.positive + a.negative));
    }
  }

  return byClaim;
}

/**
 * The viewer's vote on a claim in the one space a row votes in — what the row's cross-space totals
 * already include for them there (GEO-3819). A vote in another space is not it: subtracting that
 * would draw the count one short and the pill unpressed.
 */
export function baselineVoteFor(
  byClaim: ReadonlyMap<string, ClaimMultiSpaceVotes> | undefined,
  claimId: string,
  spaceId: string
): VoteChoice {
  return byClaim?.get(ID.uuidToHex(claimId))?.viewerVoteBySpace.get(ID.uuidToHex(spaceId)) ?? null;
}

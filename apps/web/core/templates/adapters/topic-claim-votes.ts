import { ID } from '~/core/id';

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

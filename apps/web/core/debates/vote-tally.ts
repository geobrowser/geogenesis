import { uuidToHex } from '~/core/id/normalize';

/** One "who won" vote, flattened out of its KG Vote entity. */
export type DebateVoteRecord = {
  /** The Vote entity's own id. */
  id: string;
  /** Personal space the vote was published to — identifies the voter. */
  voterSpaceId: string;
  /** Personal-space system entity of the debater the voter picked. */
  winnerSpaceEntityId: string;
  /** Display name of the pick, for the badge on that voter's comments. */
  winnerName: string | null;
  /** Winner relation id — deleted and replaced when changing a pick. */
  winnerRelationId: string | null;
};

export type DebateVoteTally = {
  /** Vote count per debater, keyed by canonical (hex) participant space id. */
  countsBySpaceEntityId: Map<string, number>;
  /** The current user's pick, or null if they haven't voted. */
  myVote: DebateVoteRecord | null;
  /** Voter space id (hex) → that voter's pick, for the crown badge on comments. */
  votesByVoterSpaceId: Map<string, DebateVoteRecord>;
};

/**
 * Collapse raw vote records into a tally.
 *
 * A voter gets one vote per debate: if their personal space somehow holds several Vote
 * entities for the same debate (a double-submit, or a publish that got retried), the last
 * one in the list wins so the count can't be inflated by a single account.
 */
export function tallyDebateVotes(votes: DebateVoteRecord[], myPersonalSpaceId: string | null): DebateVoteTally {
  const votesByVoterSpaceId = new Map<string, DebateVoteRecord>();
  for (const vote of votes) {
    votesByVoterSpaceId.set(uuidToHex(vote.voterSpaceId), vote);
  }

  const countsBySpaceEntityId = new Map<string, number>();
  for (const vote of votesByVoterSpaceId.values()) {
    const key = uuidToHex(vote.winnerSpaceEntityId);
    countsBySpaceEntityId.set(key, (countsBySpaceEntityId.get(key) ?? 0) + 1);
  }

  const myVote = myPersonalSpaceId ? (votesByVoterSpaceId.get(uuidToHex(myPersonalSpaceId)) ?? null) : null;

  return { countsBySpaceEntityId, myVote, votesByVoterSpaceId };
}

/**
 * Whole-number vote shares for an ordered set of debaters, guaranteed to sum to 100.
 *
 * Rounding each share independently makes 1/3 + 1/3 + 1/3 render as 33/33/33, which reads as
 * missing votes. Largest-remainder assigns the leftover points to whoever was rounded down
 * hardest, so the displayed numbers always add up.
 */
export function voteSharePercentages(counts: number[]): number[] {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total === 0) return counts.map(() => 0);

  const exact = counts.map(count => (count / total) * 100);
  const shares = exact.map(Math.floor);
  let remaining = 100 - shares.reduce((sum, share) => sum + share, 0);

  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder);

  for (const { index } of byRemainder) {
    if (remaining <= 0) break;
    shares[index] += 1;
    remaining -= 1;
  }

  return shares;
}

import type { ProposalStatus } from '~/core/io/substream-schema';
import { getIsProposalEnded } from '~/core/utils/utils';

export type ProposalTimestampInput = {
  status: ProposalStatus;
  /** When voting closes. 0 until the first vote stamps it. */
  endTime: number;
  /** When voting opened. 0 until the first vote stamps it. */
  startTime: number;
  /** When the proposal was submitted (indexed `createdAt`). */
  submittedAt: number;
};

/**
 * Which timestamp a proposal row should show, in seconds — 0 when it has none.
 *
 * A settled proposal is described by its voting window, so it keeps showing `startTime`.
 * An open one can't: the v2 contracts leave `startTime` and `endTime` at 0 until the
 * first vote fires, so a proposal that is awaiting votes has no voting timestamp at all
 * and its row read as undated. Submission time is the one moment such a proposal
 * definitely has, so that is what open rows show.
 */
export function proposalTimestampSeconds({
  status,
  endTime,
  startTime,
  submittedAt,
}: ProposalTimestampInput): number {
  return getIsProposalEnded(status, endTime) ? startTime : submittedAt;
}

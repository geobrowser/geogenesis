export type OpenProposalOrder = {
  /** Whether the viewer has already voted. Voted rows sink on surfaces that ask for it. */
  hasViewerVote: boolean;
  /** When voting closes. 0 until the first vote stamps it. */
  endTime: number;
  /** When the proposal was submitted (indexed `createdAt`); 0 when unresolved. */
  submittedAt: number;
};

export type OpenProposalSortOptions = {
  /** Sink rows the viewer has already voted on. */
  unvotedFirst: boolean;
  /** 'asc' lists soonest-closing first (space tab); 'desc' latest-closing first (home). */
  endTime: 'asc' | 'desc';
};

/**
 * Ordering for proposals whose voting is still open.
 *
 * The last key is the point of this: proposals awaiting their first vote all carry
 * `endTime` 0, because the v2 contracts don't stamp the voting window until someone
 * votes. They therefore tied on every earlier key and fell back to whatever order the
 * API returned, which is what made the "Voting period open" group look shuffled.
 * Newest submission first gives them a stable, meaningful order.
 *
 * Rows with no resolved submission time sort last within their tie rather than jumping
 * to the front, since 0 would otherwise read as the oldest possible timestamp.
 */
export function compareOpenProposals(a: OpenProposalOrder, b: OpenProposalOrder, options: OpenProposalSortOptions) {
  if (options.unvotedFirst && a.hasViewerVote !== b.hasViewerVote) {
    return a.hasViewerVote ? 1 : -1;
  }

  if (a.endTime !== b.endTime) {
    return options.endTime === 'asc' ? a.endTime - b.endTime : b.endTime - a.endTime;
  }

  if (a.submittedAt !== b.submittedAt) {
    if (a.submittedAt === 0) return 1;
    if (b.submittedAt === 0) return -1;
    return b.submittedAt - a.submittedAt;
  }

  return 0;
}

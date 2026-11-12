/**
 * GEO-3679's Push it down as the placement flow uses it (GEO-3678): only from the ↓ button on
 * team and To rank rows, since the Rank it / Push it down choice was removed (Preston, 12 Nov).
 *
 * `onSelect` is handed the debate and owns everything from there (the downvote, then the ballot
 * edit, in that order).
 */
export type PushDownSlot = {
  onSelect: (entityId: string) => void;
  /** What a push-down does, for its tooltip (`pushDownChoiceDescription(BEST_DEBATES_RANKING_LIVE)`). */
  description?: string;
  /**
   * Runs the publish that ranks a debate (GEO-3679's `usePushDown(debateId).rank(publish)`): it
   * publishes first, then clears the ranker's downvote on a debate they had pushed down. Resolves to
   * whether the ranking went out; false keeps the Placed confirmation open.
   */
  rank?: (entityId: string, publish: () => Promise<boolean>) => Promise<boolean>;
  /**
   * False while the ranker's vote on the debate is still being read (`usePushDown(...).isVoteKnown`):
   * a push-down waits for it, so it never acts on a vote it doesn't know yet. Defaults to true.
   */
  isReady?: (entityId: string) => boolean;
};

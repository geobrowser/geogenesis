'use client';

import * as React from 'react';

import { useBestDebateRowData } from './best-debate-row';
import { RankingFlowDialog } from './ranking-flow-dialog';

/**
 * The Push it down half of the Rank it / Push it down choice. GEO-3679 fills it; this ticket
 * (GEO-3678) owns the dialog and the Rank it path.
 *
 * `onSelect` runs when the ranker picks Push it down, after this dialog has closed. It is handed the
 * debate and owns everything from there (the downvote, then the ballot edit, in that order).
 */
export type PushDownSlot = {
  onSelect: (entityId: string) => void;
  /** The line under "Push it down" (GEO-3679: `pushDownChoiceDescription(BEST_DEBATES_RANKING_LIVE)`). */
  description?: string;
  /**
   * Runs the publish that ranks a debate (GEO-3679's `usePushDown(debateId).rank(publish)`): it
   * publishes first, then clears the ranker's downvote on a debate they had pushed down. Resolves to
   * whether the ranking went out; false keeps the Placed confirmation open.
   */
  rank?: (entityId: string, publish: () => Promise<boolean>) => Promise<boolean>;
  /**
   * False while the ranker's vote on the debate is still being read (`usePushDown(...).isVoteKnown`):
   * both choices wait, so neither acts on a vote it doesn't know yet. Defaults to true.
   */
  isReady?: (entityId: string) => boolean;
};

type Props = {
  entityId: string;
  debateName: string;
  /** The debate's speakers or space, under its name. */
  debateMeta?: string | null;
  /** True when the debate is already in the ranker's list: Rank it reads "Place it again". */
  alreadyRanked: boolean;
  onRankIt: () => void;
  pushDown?: PushDownSlot;
  onClose: () => void;
};

const OPTION_CLASS =
  'flex w-full flex-col items-start gap-1.5 rounded-lg border border-grey-02 bg-white p-4 text-left transition-colors hover:border-text focus-visible:border-text focus-visible:outline-hidden disabled:cursor-default disabled:opacity-50';
const OPTION_TITLE_CLASS = 'flex items-center gap-2 text-button text-text';
const OPTION_BODY_CLASS = 'text-metadata text-grey-04';

const RISE_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 text-purple">
    <path d="M8 13.5v-9M4.5 8L8 4.5 11.5 8M3 2.5h10" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);
const SINK_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 text-red-01">
    <path d="M8 2.5v9M4.5 8L8 11.5 11.5 8M3 13.5h10" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);

/**
 * Rank asks first: place the debate in your ranking, or push it down (GEO-3591 spec, "Pushing a
 * debate down"). Rank it publishes the ballot only and casts no upvote (11 Nov review): gaia counts
 * rankers from ballots, an upvote would move Best before cutover, and a second transaction would
 * race the smart account's nonce.
 */
export function RankChoiceDialog({
  entityId,
  debateName,
  debateMeta,
  alreadyRanked,
  onRankIt,
  pushDown,
  onClose,
}: Props) {
  const ready = pushDown?.isReady ? pushDown.isReady(entityId) : true;
  // On the Best debates screen: the claim as the title, "debaters · space" under it (mockup 04).
  const debate = useBestDebateRowData(entityId);
  const meta = debateMeta ?? ([debate?.debaters, debate?.space?.name].filter(Boolean).join(' · ') || undefined);
  return (
    <RankingFlowDialog open phoneSheet onClose={onClose} title={debate?.title ?? debateName} subtitle={meta}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-1" data-testid="rank-choice-dialog">
        <button type="button" className={OPTION_CLASS} onClick={onRankIt} disabled={!ready}>
          <span className={OPTION_TITLE_CLASS}>
            {RISE_ICON}
            {alreadyRanked ? 'Place it again' : 'Rank it'}
          </span>
          <span className={OPTION_BODY_CLASS}>
            Worth showing more people. A few “which was better?” choices find its place in your ranking.
          </span>
        </button>
        {pushDown ? (
          <button
            type="button"
            className={OPTION_CLASS}
            disabled={!ready}
            onClick={() => {
              onClose();
              pushDown.onSelect(entityId);
            }}
          >
            <span className={OPTION_TITLE_CLASS}>
              {SINK_ICON}
              Push it down
            </span>
            <span className={OPTION_BODY_CLASS}>
              {pushDown.description ?? 'Low quality. Keep it out of your ranking.'}
            </span>
          </button>
        ) : null}
      </div>
    </RankingFlowDialog>
  );
}

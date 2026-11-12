'use client';

import * as React from 'react';

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
   * Wraps the publish that ranks a debate, so a debate this ranker pushed down has its downvote
   * cleared before the ballot goes out (GEO-3679's `usePushDown(debateId).rankAfterClearing`).
   * Resolves to what `publish` resolved to; false keeps the Placed confirmation open.
   */
  rankAfterClearing?: (entityId: string, publish: () => Promise<boolean>) => Promise<boolean>;
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
  'flex w-full flex-col items-start gap-1 rounded-lg border border-grey-02 bg-white p-4 text-left transition-colors hover:border-text focus-visible:border-text focus-visible:outline-hidden';

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
  return (
    <RankingFlowDialog open onClose={onClose} title={debateName} subtitle={debateMeta ?? undefined}>
      <div className="flex flex-col gap-2" data-testid="rank-choice-dialog">
        <button type="button" className={OPTION_CLASS} onClick={onRankIt}>
          <span className="text-button font-medium text-text">{alreadyRanked ? 'Place it again' : 'Rank it'}</span>
          <span className="text-metadata text-grey-04">
            Worth showing more people. A few “which was better?” choices find its place in your ranking.
          </span>
        </button>
        {pushDown ? (
          <button
            type="button"
            className={OPTION_CLASS}
            onClick={() => {
              onClose();
              pushDown.onSelect(entityId);
            }}
          >
            <span className="text-button font-medium text-text">Push it down</span>
            <span className="text-metadata text-grey-04">
              {pushDown.description ?? 'Low quality. Keep it out of your ranking.'}
            </span>
          </button>
        ) : null}
      </div>
    </RankingFlowDialog>
  );
}

'use client';

import * as React from 'react';

import { getRankingBallotMaxItems } from '~/core/blocks/ranking/ranking-publish-queue';
import { useSetToast } from '~/core/hooks/use-toast';

import { copyTeamOrderToDraft } from './copy-team-order';

type Props = {
  /** The team ranking, in order. */
  teamOrder: readonly string[];
  isTeamOrderLoading: boolean;
  /** The viewer has a published ranking (or it is still being read): then this never shows. */
  hasRanking: boolean;
  draftIsEmpty: boolean;
  pushedDownIds: readonly string[];
  setDraft: (ids: string[]) => void;
  maxItems?: number;
};

/**
 * Your ranking's empty state, for a viewer with no ranking at all: copy the whole team ranking into
 * the draft as a starting point (Preston, 12 Nov). Nothing publishes until Publish, and the toast's
 * Undo empties the draft again. Self-contained with `copy-team-order.ts`, so removing it is
 * deleting the two files and the `emptyAction` that renders this.
 */
export function CopyTeamRankingStart({
  teamOrder,
  isTeamOrderLoading,
  hasRanking,
  draftIsEmpty,
  pushedDownIds,
  setDraft,
  maxItems = getRankingBallotMaxItems(),
}: Props) {
  const setToast = useSetToast();
  const copy = React.useMemo(
    () => copyTeamOrderToDraft({ teamOrder, pushedDownIds, maxItems }),
    [maxItems, pushedDownIds, teamOrder]
  );

  if (hasRanking || !draftIsEmpty) return null;
  if (!isTeamOrderLoading && copy.ids.length === 0) return null;

  const count = copy.ids.length;
  const onCopy = () => {
    setDraft(copy.ids);
    setToast(
      <span className="flex items-center gap-3">
        <span>Copied {count === 1 ? '1 debate' : `${count} debates`} from the team ranking.</span>
        <button
          type="button"
          onClick={() => {
            setToast(null);
            setDraft([]);
          }}
          className="shrink-0 rounded px-2 py-1 text-smallButton text-white underline-offset-2 hover:underline"
        >
          Undo
        </button>
      </span>
    );
  };

  return (
    <div className="mt-3 flex flex-col items-start gap-1.5" data-testid="copy-team-ranking">
      <button
        type="button"
        disabled={isTeamOrderLoading}
        onClick={onCopy}
        className="flex h-8 items-center rounded-full border border-grey-02 bg-white px-3 text-button text-text transition-colors hover:border-text disabled:cursor-not-allowed disabled:text-grey-03 disabled:hover:border-grey-02 md:h-11"
      >
        Start from the team ranking
      </button>
      {isTeamOrderLoading ? (
        <span
          aria-hidden
          className="block h-4 w-56 animate-pulse rounded bg-grey-01"
          data-testid="copy-team-count-skeleton"
        />
      ) : (
        <p className="m-0 text-footnote text-grey-04">
          {copy.capped
            ? `Copies the team's top ${count} of ${copy.available} debates in order (a ranking holds up to ${count}). You can reorder before publishing.`
            : `Copies the team's ${count === 1 ? '1 debate' : `${count} debates`} in order. You can reorder before publishing.`}
        </p>
      )}
    </div>
  );
}

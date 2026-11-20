'use client';

import { GRADE_UNDO_LABEL } from '~/core/blocks/ranking/ranking-grades';

/**
 * Marks a toast the ranking's popups let through: pressing its Undo while the watch popup is open
 * must not close the popup (`RankingFlowDialog`).
 */
export const RANKING_TOAST_ATTRIBUTE = 'data-ranking-toast';

/** True for a press inside a toast marked with `RANKING_TOAST_ATTRIBUTE`. */
export function isInRankingToast(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(`[${RANKING_TOAST_ATTRIBUTE}]`) !== null;
}

/**
 * The ranking's toast with Undo (Clear's and Remove's): `copy`, then an Undo that clears the toast
 * before `onUndo` runs. Marked with `RANKING_TOAST_ATTRIBUTE`.
 */
export function RankingUndoToast({
  copy,
  onUndo,
  analyticsLabel,
}: {
  copy: string;
  onUndo: () => void;
  analyticsLabel?: string;
}) {
  return (
    <span className="flex items-center gap-3" {...{ [RANKING_TOAST_ATTRIBUTE]: '' }}>
      <span>{copy}</span>
      <button
        type="button"
        onClick={onUndo}
        className="shrink-0 rounded px-2 py-1 text-smallButton text-white underline-offset-2 hover:underline"
        data-geo-analytics-label={analyticsLabel}
      >
        {GRADE_UNDO_LABEL}
      </button>
    </span>
  );
}

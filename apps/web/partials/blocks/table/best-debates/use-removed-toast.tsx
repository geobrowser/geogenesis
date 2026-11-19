'use client';

import * as React from 'react';

import { GRADE_UNDO_LABEL, removedFromRankingCopy } from '~/core/blocks/ranking/ranking-grades';
import { useClearToastIfShowing, useSetToast } from '~/core/hooks/use-toast';

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

/**
 * The toast after a debate is taken out of your ranking (GEO-3805): `Removed “Name”.` and Undo,
 * in Clear's shape (`RankingUndoToast`). A second remove replaces it. When the screen or
 * block that showed it goes away, its toast goes with it (only if it is still the one showing),
 * and its Undo does nothing from then on.
 */
export function useRemovedToast() {
  const setToast = useSetToast();
  const clearIfShowing = useClearToastIfShowing();
  const shown = React.useRef<React.ReactElement | null>(null);
  const mounted = React.useRef(true);

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (shown.current) clearIfShowing(shown.current);
      shown.current = null;
    };
  }, [clearIfShowing]);

  return React.useCallback(
    (name: string | null, onUndo: () => void) => {
      const toast = (
        <RankingUndoToast
          copy={removedFromRankingCopy(name)}
          onUndo={() => {
            if (shown.current === toast) shown.current = null;
            setToast(null);
            if (mounted.current) onUndo();
          }}
          analyticsLabel="ranking_remove_undo"
        />
      );
      shown.current = toast;
      setToast(toast);
    },
    [setToast]
  );
}

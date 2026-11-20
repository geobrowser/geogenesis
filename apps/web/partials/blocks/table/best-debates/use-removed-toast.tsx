'use client';

import * as React from 'react';

import { removedFromRankingCopy } from '~/core/blocks/ranking/ranking-grades';
import { useClearToastIfShowing, useSetToast } from '~/core/hooks/use-toast';

import { RankingUndoToast } from './ranking-undo-toast';

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

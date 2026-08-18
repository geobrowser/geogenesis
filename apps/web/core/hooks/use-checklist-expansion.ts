'use client';

import * as React from 'react';

/**
 * Open/closed state for a checklist that folds itself away once there is nothing left to do.
 *
 * A finished checklist is a wall of ticks, so it collapses to its heading and progress bar rather
 * than holding a column open — but it stays there, because "100% complete" is the point, and
 * because the next reset makes it relevant again.
 *
 * Two things it deliberately does not do. It won't act on completion it doesn't have yet, so a
 * checklist that is still loading is left alone rather than folded on an unknown answer. And it
 * won't overrule the reader: opening a finished checklist keeps it open, and closing an unfinished
 * one keeps it closed, for as long as they're looking at it.
 */
export function useChecklistExpansion({ allComplete, isLoading }: { allComplete: boolean; isLoading: boolean }): {
  expanded: boolean;
  onToggle: () => void;
} {
  const [expanded, setExpanded] = React.useState(true);
  const readerHasChosen = React.useRef(false);

  React.useEffect(() => {
    if (readerHasChosen.current || isLoading) return;
    setExpanded(!allComplete);
  }, [allComplete, isLoading]);

  const onToggle = React.useCallback(() => {
    readerHasChosen.current = true;
    setExpanded(prev => !prev);
  }, []);

  return { expanded, onToggle };
}

'use client';

import * as React from 'react';

/**
 * True only once `value` has been true for `delayMs` without interruption, and false again the
 * instant it drops — the delay is on the way up only.
 *
 * For loading states short enough that showing one is worse than showing nothing: a response that
 * lands inside the window never gets a placeholder, so the thing it would have covered simply
 * updates in place.
 */
export function useDelayedFlag(value: boolean, delayMs: number): boolean {
  const [elapsed, setElapsed] = React.useState(false);

  React.useEffect(() => {
    if (!value) {
      setElapsed(false);
      return;
    }

    const timeout = setTimeout(() => setElapsed(true), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  // `value &&` rather than `elapsed` alone: the effect clears `elapsed` a render after the flag
  // drops, and that one render would otherwise still be showing the placeholder.
  return value && elapsed;
}

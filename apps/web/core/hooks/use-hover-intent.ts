'use client';

import * as React from 'react';

/**
 * The timer behind a card that opens on a resting pointer and closes after a short grace: one timer,
 * because opening and closing replace each other — entering cancels a pending close, leaving cancels
 * a pending open. Shared by the navbar's live-lobbies preview, the calendar week's person card and
 * the People row's profile card, which each carried their own copy.
 *
 * The caller says what opening and closing do, so a card that opens with a payload (the calendar's
 * person and anchor) uses the same timer as one that is only open or shut. Cleared on unmount, so a
 * pending open never fires into a component that has gone.
 */
export function useHoverIntent({ openDelay, closeDelay }: { openDelay: number; closeDelay: number }) {
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  React.useEffect(() => cancel, [cancel]);

  /** Run `open` once the pointer has rested `delay` ms (default `openDelay`); `0` runs it now. */
  const openSoon = React.useCallback(
    (open: () => void, delay: number = openDelay) => {
      cancel();
      if (delay === 0) {
        open();
        return;
      }
      timer.current = setTimeout(() => {
        timer.current = null;
        open();
      }, delay);
    },
    [cancel, openDelay]
  );

  /** Run `close` after the grace, unless the pointer comes back (or onto the card) first. */
  const closeSoon = React.useCallback(
    (close: () => void) => {
      cancel();
      timer.current = setTimeout(() => {
        timer.current = null;
        close();
      }, closeDelay);
    },
    [cancel, closeDelay]
  );

  /** Whether an open or close is waiting to happen. */
  const pending = React.useCallback(() => timer.current !== null, []);

  return { openSoon, closeSoon, cancel, pending };
}

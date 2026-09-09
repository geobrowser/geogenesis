'use client';

import * as React from 'react';

import { debateHoursNote, debateHoursWindow } from '../debate-hours';
import { HubMessageNote } from './hub-states';

/**
 * "Debate hours are every day between 5-6pm…" / "Stay here and you'll be matched…", under a hub
 * tab's own empty message.
 *
 * A component rather than a string the tab computes, for two reasons. It only mounts while an
 * empty state is on screen, so the timer below exists only when something depends on it. And the
 * ticking re-render lands here instead of on the tab, which is holding a query, a filter set and a
 * list order that have no interest in the clock.
 *
 * Rendered by the caller only when the list is empty *because nobody is online* — a list emptied by
 * the viewer's own filters is a different problem with a different answer, and GEO-2840 explicitly
 * leaves it alone.
 */
export function DebateHoursNote({
  /**
   * Whether the list under this note fills itself in, which decides what the during-hours variant
   * can honestly ask of the viewer. Passed rather than read from auth here: it is a fact about the
   * caller's list, and only People can be looking at one that doesn't update.
   */
  live,
}: {
  live: boolean;
}) {
  const now = useTickingNow();
  // Null until mounted — the paragraph included, so nothing empty is left standing in its place.
  // The window is expressed in the viewer's local zone, which the server does not have and cannot
  // guess, so rendering it during SSR would hydrate as a mismatch.
  if (!now) return null;
  return <HubMessageNote>{debateHoursNote(debateHoursWindow(now), { live })}</HubMessageNote>;
}

/**
 * Enough to clear the boundary rather than land a hair short of it — `setTimeout` counts on a
 * different clock than `Date`, so a wake aimed exactly at 9:00:00 can read 8:59:59.999. Small
 * enough that nobody sees it: the copy is a second sentence in an empty state, not a countdown.
 */
const BOUNDARY_OVERSHOOT_MS = 50;

/**
 * Floor on a reschedule. A wake that lands early anyway recomputes the same side and asks for the
 * few milliseconds it was short by, and this keeps that from becoming a busy loop — at the cost of
 * at most this much staleness at the boundary, which is the only place it can apply.
 */
const MIN_TICK_MS = 250;

/**
 * `now`, re-read each time the open/closed answer changes.
 *
 * Scheduled to the boundary rather than polled: the copy has to flip at 9:00 without a refresh, and
 * a window that opens once a day does not need a heartbeat for the other 23 hours to find that out.
 */
function useTickingNow() {
  const [now, setNow] = React.useState<Date | null>(null);

  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      const current = new Date();
      setNow(current);
      const { nextTransition } = debateHoursWindow(current);
      timer = setTimeout(
        tick,
        Math.max(MIN_TICK_MS, nextTransition.getTime() - current.getTime() + BOUNDARY_OVERSHOOT_MS)
      );
    };

    tick();

    // Background tabs are throttled and sleeping machines don't run timers at all, so a window can
    // open while this one is owed a callback it never got. Coming back into view is the moment that
    // matters — it is also when `useDebatePeople` refetches presence — so re-read the clock then.
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      clearTimeout(timer);
      tick();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return now;
}

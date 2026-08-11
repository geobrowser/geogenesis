'use client';

import * as React from 'react';

/**
 * The hub's lists are server-sorted by live signals — people available now, then total positions,
 * then recency — so acting on a card re-sorts it out from under the pointer. Toggling readiness on
 * the seventh claim could send it to the top, moving the control you just pressed.
 *
 * Rows the client has already rendered keep their relative order for the life of the view;
 * genuinely new rows land where the server put them. `resetKey` releases the hold at the
 * boundaries where a fresh list is what the user is asking for — a new search, filter, or space.
 *
 * The tradeoff: a claim that gets hot mid-session won't climb until a reset. In a narrow panel the
 * user is actively working, that's the right trade — freshness still arrives as new rows appearing
 * in their correct place.
 */
export function useStableListOrder<T>(items: T[], keyOf: (item: T) => string, resetKey: string): T[] {
  const orderRef = React.useRef<string[]>([]);
  const resetRef = React.useRef(resetKey);
  // Kept in a ref so callers can pass an inline arrow without busting the memo every render.
  const keyOfRef = React.useRef(keyOf);
  keyOfRef.current = keyOf;

  if (resetRef.current !== resetKey) {
    resetRef.current = resetKey;
    orderRef.current = [];
  }

  return React.useMemo(() => {
    const key = keyOfRef.current;
    const byKey = new Map(items.map(item => [key(item), item]));
    const remembered = orderRef.current;
    const seen = new Set(remembered);
    const held = remembered.filter(entry => byKey.has(entry));

    // Walk the server order. Keys we've shown before are drained in their remembered order, so
    // their relative positions survive; keys we haven't land exactly where the server put them.
    const next: string[] = [];
    let heldIndex = 0;
    for (const item of items) {
      const itemKey = key(item);
      if (seen.has(itemKey)) {
        if (heldIndex < held.length) next.push(held[heldIndex++]);
      } else {
        next.push(itemKey);
      }
    }
    while (heldIndex < held.length) next.push(held[heldIndex++]);

    // Writing during render is safe here because the result is a fixed point: recomputing from
    // `next` yields `next`, so a discarded or double-invoked memo produces the same order.
    orderRef.current = next;
    return next.map(entry => byKey.get(entry)).filter((item): item is T => item !== undefined);
  }, [items, resetKey]);
}

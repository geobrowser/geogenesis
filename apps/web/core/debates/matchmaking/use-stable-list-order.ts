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
 *
 * `appendNew` puts rows not seen before after every row already shown instead (GEO-3463), for a list
 * sorted in hand that pages: page 2's best claim would otherwise land above the rows being read.
 */
export function useStableListOrder<T>(
  items: T[],
  keyOf: (item: T) => string,
  resetKey: string,
  { appendNew = false }: { appendNew?: boolean } = {}
): T[] {
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
    const fresh: string[] = [];
    let heldIndex = 0;
    for (const item of items) {
      const itemKey = key(item);
      if (seen.has(itemKey)) {
        if (heldIndex < held.length) next.push(held[heldIndex++]);
      } else {
        (appendNew ? fresh : next).push(itemKey);
      }
    }
    while (heldIndex < held.length) next.push(held[heldIndex++]);
    next.push(...fresh);

    // Writing during render is safe here because the result is a fixed point: recomputing from
    // `next` yields `next`, so a discarded or double-invoked memo produces the same order.
    orderRef.current = next;
    return next.map(entry => byKey.get(entry)).filter((item): item is T => item !== undefined);
    // `resetKey` is not read in here — it is consumed above, during render, to clear `orderRef`.
    // It stays in this list precisely because of that: when it changes the remembered order is
    // emptied, and the memo has to recompute against the cleared order rather than hand back the
    // last one. Dropping it as "unnecessary" would return a stale order on every reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appendNew, items, resetKey]);
}

export type NewArrivals<T> = {
  /** Arrivals first, newest on top, then everything else in the order it came in. */
  items: T[];
  /** Arrivals not yet seen or acted on. */
  newKeys: ReadonlySet<string>;
  /** Arrivals kept off the list while `hold` is set. */
  waitingCount: number;
  /** The viewer has seen or acted on this arrival. */
  dismiss: (key: string) => void;
};

/**
 * Rows that appear after the list first settled go to the top, newest first; the rest keep their order.
 * While `hold` is set they wait off the list, so nothing is pushed down under the viewer.
 */
export function useNewArrivalsFirst<T>(
  items: T[],
  keyOf: (item: T) => string,
  { resetKey, settled, hold }: { resetKey: string; settled: boolean; hold: boolean }
): NewArrivals<T> {
  const keyOfRef = React.useRef(keyOf);
  keyOfRef.current = keyOf;
  const stateRef = React.useRef(emptyArrivals());
  const resetRef = React.useRef(resetKey);
  const [dismissed, setDismissed] = React.useState<ReadonlySet<string>>(NO_KEYS);

  if (resetRef.current !== resetKey) {
    resetRef.current = resetKey;
    stateRef.current = emptyArrivals();
  }

  React.useEffect(() => setDismissed(NO_KEYS), [resetKey]);

  const arranged = React.useMemo(() => {
    const key = keyOfRef.current;
    const next = arrangeArrivals(
      stateRef.current,
      items.map(item => key(item)),
      settled,
      hold
    );
    // A fixed point, as in `useStableListOrder`: re-running with the same input yields the same state.
    stateRef.current = next.state;
    const byKey = new Map(items.map(item => [key(item), item]));
    return {
      items: next.order.map(entry => byKey.get(entry)).filter((item): item is T => item !== undefined),
      arrivals: [...next.state.lifted, ...next.state.waiting],
      waitingCount: next.state.waiting.length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `resetKey` clears the state above, during render
  }, [items, settled, hold, resetKey]);

  const newKeys = React.useMemo(
    () => new Set(arranged.arrivals.filter(entry => !dismissed.has(entry))),
    [arranged.arrivals, dismissed]
  );
  const dismiss = React.useCallback(
    (entry: string) => setDismissed(current => (current.has(entry) ? current : new Set([...current, entry]))),
    []
  );

  return { items: arranged.items, newKeys, waitingCount: arranged.waitingCount, dismiss };
}

const NO_KEYS: ReadonlySet<string> = new Set();

type ArrivalsState = {
  /** `null` until the list first settles; what is there then is not new. */
  present: ReadonlySet<string> | null;
  /** Shown at the top, newest first. */
  lifted: string[];
  /** Arrived while held, newest first. */
  waiting: string[];
};

function emptyArrivals(): ArrivalsState {
  return { present: null, lifted: [], waiting: [] };
}

/** Exported for tests. */
export function arrangeArrivals(
  state: ArrivalsState,
  keys: string[],
  settled: boolean,
  hold: boolean
): { state: ArrivalsState; order: string[] } {
  if (state.present === null) {
    if (!settled) return { state, order: keys };
    return { state: { ...state, present: new Set(keys) }, order: keys };
  }

  const present = new Set(keys);
  // In the order given, so several arriving together keep it.
  const arrived = keys.filter(key => !state.present?.has(key));
  let lifted = state.lifted.filter(key => present.has(key));
  let waiting = [...arrived, ...state.waiting.filter(key => present.has(key))];
  if (!hold) {
    lifted = [...waiting, ...lifted];
    waiting = [];
  }

  const top = new Set([...lifted, ...waiting]);
  const order = [...lifted, ...keys.filter(key => !top.has(key))];
  const next = { present, lifted, waiting };
  return { state: sameArrivals(state, next) ? state : next, order };
}

function sameArrivals(a: ArrivalsState, b: ArrivalsState) {
  const sameList = (x: string[], y: string[]) => x.length === y.length && x.every((key, i) => key === y[i]);
  return (
    sameList(a.lifted, b.lifted) &&
    sameList(a.waiting, b.waiting) &&
    a.present !== null &&
    b.present !== null &&
    a.present.size === b.present.size &&
    [...b.present].every(key => a.present?.has(key))
  );
}

'use client';

import * as React from 'react';

/**
 * How long an answered row stays on screen before it folds away (GEO-2863).
 *
 * The press has to land visually before the card it was made on leaves. Collapsing on the same tick
 * takes the row out from under the cursor at the moment of the click, which reads as the button
 * having missed rather than as the claim being done with.
 *
 * Only a row answered *while the viewer was looking at it* waits. One that was already answered when
 * the list first drew is simply never shown — there is nothing to fold, and nothing happened.
 */
export const ANSWERED_COLLAPSE_HOLD_MS = 1_000;

/**
 * What the caller knows about the viewer's side on a row.
 *
 * `unknown` is the one that matters and the reason this is three-valued rather than a boolean: the
 * lookups that carry the viewer's side are separate queries from the list, and "holds no position"
 * and "not asked yet" arrive as the same `null`. Reading the second as the first folds a row away
 * underneath someone before anyone knew whether they had answered it.
 */
export type AnsweredState = 'answered' | 'unanswered' | 'unknown';

type CollapseOptions<T> = {
  /** Stable per row, and stable across a refetch — the same key the list is keyed by. */
  keyOf: (row: T) => string;
  answeredStateOf: (row: T) => AnsweredState;
  /**
   * Off for a list that is *about* the viewer's positions. Collapsing every row of one leaves it
   * permanently empty, which is not a filter but a broken tab.
   */
  enabled: boolean;
  /** Exposed for tests; production has no reason to pass it. */
  holdMs?: number;
};

/**
 * Drops the rows the viewer has already answered, holding back the ones they answered in place.
 *
 * The distinction the hold turns on is "was this row ever on screen unanswered". A row that arrives
 * answered never had a presence to lose, so it is filtered on the first render it appears in and
 * never flashes. A row the viewer answers while reading it was on screen a moment ago, so it stays
 * for {@link ANSWERED_COLLAPSE_HOLD_MS} and then leaves — which is what gives `AnimatePresence`
 * something to animate rather than a list that silently has one fewer row.
 *
 * Bookkeeping runs in an effect rather than during render, and that ordering is the point: on the
 * render where a row first appears the effect has not seen it, so it counts as never-seen and an
 * answered one is dropped straight away. Only a row recorded by an earlier commit can hold.
 */
export function useCollapseAnswered<T>(
  rows: T[],
  { keyOf, answeredStateOf, enabled, holdMs }: CollapseOptions<T>
): T[] {
  const hold = holdMs ?? ANSWERED_COLLAPSE_HOLD_MS;
  // Rows this hook has seen unanswered, and rows whose hold has already run out. Refs rather than
  // state: neither changes what is on screen on its own — `holding` below does that — and a render
  // per bookkeeping write would be a render per row.
  const seenUnanswered = React.useRef(new Set<string>());
  const foldedOut = React.useRef(new Set<string>());
  const timers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [holding, setHolding] = React.useState<ReadonlySet<string>>(() => new Set());

  // Every render rather than on a dependency list, and that is the cheaper of the two: the callbacks
  // come from the caller, so a list would either churn on inline ones or go stale on memoized ones.
  // The guards below make the body idempotent — a row already holding, already folded, or already
  // recorded does nothing — so the cost is one pass over the rows and `setHolding` bails on identity.
  React.useEffect(() => {
    if (!enabled) return;

    for (const row of rows) {
      const key = keyOf(row);
      const state = answeredStateOf(row);

      if (state === 'unknown') continue;
      if (state === 'unanswered') {
        // Answering, clearing, and answering again is two separate folds, so the record of having
        // folded is cleared with the answer that produced it.
        seenUnanswered.current.add(key);
        foldedOut.current.delete(key);
        continue;
      }
      if (!seenUnanswered.current.has(key)) continue;
      if (foldedOut.current.has(key) || timers.current.has(key)) continue;

      // The timer lives in a ref rather than in this effect's cleanup. The effect re-runs on every
      // render, and a cleanup that cancelled the pending fold would restart the hold each time —
      // which, with a list that refetches, is a row that never leaves.
      timers.current.set(
        key,
        setTimeout(() => {
          timers.current.delete(key);
          foldedOut.current.add(key);
          setHolding(current => {
            const next = new Set(current);
            next.delete(key);
            return next;
          });
        }, hold)
      );
      // Same set back where the key is already in it: a fresh `Set` every render is a fresh
      // identity, and this effect runs on every render.
      setHolding(current => (current.has(key) ? current : new Set(current).add(key)));
    }
  });

  // Only on the way out. A fold in flight when the tab unmounts has nothing left to fold.
  React.useEffect(() => {
    const pending = timers.current;

    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  return React.useMemo(() => {
    if (!enabled) return rows;

    return rows.filter(row => answeredStateOf(row) !== 'answered' || holding.has(keyOf(row)));
  }, [answeredStateOf, enabled, holding, keyOf, rows]);
}

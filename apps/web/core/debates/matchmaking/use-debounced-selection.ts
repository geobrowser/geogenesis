'use client';

import { useDebouncedValue } from '~/core/hooks/use-debounced-value';

/**
 * Just long enough to coalesce a run of ticks into one request. It was 350ms while the backend
 * took seconds and each discarded request was expensive; now that GEO-2721 has landed the request
 * is the cheap part, and the wait is the only thing left that anyone can feel.
 */
export const SELECTION_DEBOUNCE_MS = 120;

export type DebouncedSelection = {
  /** What the request carries: the selection once it has stopped moving. */
  value: string[];
  /**
   * The menu is showing a selection no request has been made under yet.
   *
   * Worth reporting separately because nothing else can see it. During the debounce the query key
   * hasn't changed, so React Query is idle and reports neither loading nor placeholder data — yet
   * the counts on screen still answer the previous selection, which is exactly the state callers
   * hide their counts for.
   */
  pending: boolean;
};

/**
 * Debounces a list of filter ids for the request while the menu keeps rendering every tick.
 *
 * Shared by both claim pickers: they debounce for the same reason, and a selection that settled at
 * two different speeds depending on which surface you were on would be its own bug.
 */
export function useDebouncedSelection(selection: string[]): DebouncedSelection {
  const value = useDebouncedValue(selection, SELECTION_DEBOUNCE_MS);

  // By content rather than by identity. `useDebouncedValue` does hand back the very array it was
  // given once it flushes, so identity would work today — but it would also read as permanently
  // pending for a caller that builds its list inline, and that failure would be silent.
  const pending = value.length !== selection.length || value.some((id, index) => id !== selection[index]);

  return { value, pending };
}

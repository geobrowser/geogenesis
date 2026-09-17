'use client';

import * as React from 'react';

/**
 * `value` once it has settled, and the last settled value while it is settling again.
 *
 * For a list that is about to be replaced by the same list, narrowed: a filter change, a new search,
 * a refetch. Rebuilding it from scratch means a round trip with nothing to show, and showing nothing
 * reads as "there is nothing" rather than "hold on" — so the rows a viewer is reading stay until the
 * rows that replace them arrive.
 *
 * Before the first settle there is nothing to hold, and the (empty) unsettled value comes through —
 * which is what lets a first load show a loading state instead of an empty list. Callers that draw a
 * skeleton should ask whether anything is held rather than whether something is in flight: the two
 * differ exactly here.
 *
 * `placeholderData: keepPreviousData` is the same idea inside one query and is the better tool where
 * it applies. It does not apply across a `useQueries` list, whose observers are rebuilt from their
 * array each render, so a per-entry placeholder has no previous entry to keep.
 *
 * `resetKey` is what the hold belongs to. Holding across a change of key holds the wrong thing —
 * another session's claims, another tag's rows — so the hold is dropped when it changes rather than
 * carried into a list it was never about.
 */
export function useLastSettled<T>(value: T, settling: boolean, resetKey: string): T {
  const lastSettledRef = React.useRef<{ value: T } | null>(null);
  const resetRef = React.useRef(resetKey);

  if (resetRef.current !== resetKey) {
    resetRef.current = resetKey;
    lastSettledRef.current = null;
  }

  if (!settling) lastSettledRef.current = { value };
  return settling && lastSettledRef.current ? lastSettledRef.current.value : value;
}

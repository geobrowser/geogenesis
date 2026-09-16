'use client';

import * as React from 'react';

/**
 * Long enough that a run of keystrokes is one request rather than one per letter, short enough
 * that pausing to read the list doesn't feel like waiting for it.
 */
export const SEARCH_DEBOUNCE_MS = 250;

export type DebouncedSearch = {
  /** What the request carries: the trimmed query, once the typing has paused. */
  value: string;
  /**
   * The box shows a query no request has been made under yet.
   *
   * The counterpart of the same field on {@link DebouncedSelection}, and reported for the same
   * reason: during the debounce the query key hasn't changed, so React Query is idle and reports
   * neither loading nor placeholder data — while the facets on screen still answer the previous
   * query. Search narrows them exactly as the space and topic filters do.
   */
  pending: boolean;
};

/**
 * Debounces the search box for the request while the box itself keeps every keystroke.
 *
 * Shared by both claim pickers, which had grown identical copies of this down to the constant.
 */
export function useDebouncedSearch(search: string): DebouncedSearch {
  // Seeded from what it is handed, the way `useDebouncedValue` behind `useDebouncedSelection` is.
  //
  // Starting at `''` was harmless while every caller held its search in `useState` and so always
  // mounted empty. The hub's search is session state now (GEO-2861), and a component that mounts
  // onto a search already in progress — Lobby's other list after the toggle, or the panel reopened
  // — read `''` for a debounce: the list rendered unfiltered, and the request that went out under
  // that empty key was one nothing on screen was waiting for. The debounce is for a viewer typing,
  // not for a value that settled before this mount existed.
  const [value, setValue] = React.useState(() => search.trim());

  React.useEffect(() => {
    const timeout = setTimeout(() => setValue(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [search]);

  // Trimmed on both sides: trailing whitespace never reaches the request, so a query that differs
  // from the one in flight only by a space the user just typed has genuinely settled.
  return { value, pending: search.trim() !== value };
}

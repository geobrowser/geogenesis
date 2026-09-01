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
  const [value, setValue] = React.useState('');

  React.useEffect(() => {
    const timeout = setTimeout(() => setValue(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [search]);

  // Trimmed on both sides: trailing whitespace never reaches the request, so a query that differs
  // from the one in flight only by a space the user just typed has genuinely settled.
  return { value, pending: search.trim() !== value };
}

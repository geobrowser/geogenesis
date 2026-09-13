'use client';

import * as React from 'react';

/**
 * How many pages the list may fetch on its own without turning up a single row to show.
 *
 * Five pages is 250 claims, which is deep enough that a viewer with an ordinary backlog never
 * reaches it and shallow enough that one who does is not left waiting on a dozen round trips they
 * did not ask for.
 */
export const AUTO_PAGES_WITHOUT_ROWS = 5;

/**
 * Keeps a client-side filter from paging the whole corpus on the viewer's behalf (GEO-2863).
 *
 * "Hide my positions" is applied here rather than by the server — neither the graph nor geo-chat
 * can answer "claims this viewer has not responded to" — so it removes rows from a page *after* it
 * arrives. The infinite-scroll sentinel sits at the end of what is left, which means a viewer who
 * has answered most of a corpus leaves it permanently in view: the page lands, the filter empties
 * it, the sentinel fires, and around again until the corpus runs out. Each turn is a catalog page
 * plus a row lookup for fifty claims, and the people it happens to are precisely the ones the
 * feature is for.
 *
 * So the list keeps advancing on its own only while that is getting somewhere. After
 * {@link AUTO_PAGES_WITHOUT_ROWS} pages that add nothing visible it stops and says so, and going
 * further is the viewer's to ask for.
 *
 * The cap counts *barren* pages rather than pages, so a list that is finding rows scrolls as far as
 * the viewer likes; only a search that is turning up nothing is bounded.
 *
 * All of which is a mitigation, not a fix. GEO-2894 is the fix: let the graph filter out entities
 * the viewer has already acted on, so a page arrives full of rows that can be shown and there is
 * nothing here to bound. This hook comes out with it.
 */
export function useBoundedPaging({
  loaded,
  visible,
  hasNextPage,
  fetchNextPage,
  resetKey,
}: {
  /** Rows fetched so far, filtered or not — what a new page adds to. */
  loaded: number;
  /** Rows actually on screen — what a new page is supposed to add to. */
  visible: number;
  hasNextPage: boolean;
  fetchNextPage: () => unknown;
  /** A different list: a different corpus to search, and a fresh budget to search it with. */
  resetKey: string;
}): {
  /** Whether the sentinel should be mounted — i.e. whether the list may still advance by itself. */
  autoPages: boolean;
  /** Stopped short with pages left, rather than having reached the end of the corpus. */
  stoppedShort: boolean;
  /** Spends another budget. For the control the viewer presses to go on. */
  keepLooking: () => void;
} {
  const [barren, setBarren] = React.useState(0);
  const seen = React.useRef({ loaded: 0, visible: 0, key: resetKey });

  if (seen.current.key !== resetKey) {
    seen.current = { loaded: 0, visible: 0, key: resetKey };
    if (barren !== 0) setBarren(0);
  }

  React.useEffect(() => {
    // Only when a page has actually landed. Rows leaving — the viewer answering one, a filter
    // narrowing — is not a barren fetch, and counting it would spend the budget on the viewer's own
    // typing.
    if (loaded <= seen.current.loaded) {
      seen.current = { ...seen.current, loaded, visible };
      return;
    }

    const grew = visible > seen.current.visible;
    seen.current = { ...seen.current, loaded, visible };
    setBarren(count => (grew ? 0 : count + 1));
  }, [loaded, visible]);

  const keepLooking = React.useCallback(() => {
    setBarren(0);
    void fetchNextPage();
  }, [fetchNextPage]);

  const stoppedShort = hasNextPage && barren >= AUTO_PAGES_WITHOUT_ROWS;

  return { autoPages: hasNextPage && !stoppedShort, stoppedShort, keepLooking };
}

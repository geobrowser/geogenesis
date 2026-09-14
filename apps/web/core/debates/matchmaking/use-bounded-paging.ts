'use client';

import * as React from 'react';

/**
 * How many pages the list may fetch on its own without turning up a single row to show.
 *
 * Fifteen pages is 750 claims. Five was the first guess and it was too tight: the counter resets on
 * any page that shows something, so reaching it at all means 250 answered claims in a row — which
 * is not the extreme case it sounded like, but the ordinary one for the viewer this feature is for.
 * They scrolled a short way and the list stopped, which is the failure this bound was supposed to
 * be preferable to.
 *
 * There is no number that is right for someone who has answered *everything*, because the filter
 * runs on rows the server has already sent. GEO-2894 is what fixes that; until then this is set
 * where it is rarely reached rather than where it is cheap, and the fifteen round trips it allows
 * are the price of the filter being on this side of the wire at all.
 */
export const AUTO_PAGES_WITHOUT_ROWS = 15;

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
  settling,
  paused = false,
  hasNextPage,
  fetchNextPage,
  resetKey,
}: {
  /**
   * Rows the *server* has returned so far, before any client-side gate touches them.
   *
   * This is what says a page landed, so it has to be the raw count. Handed a filtered one, a page
   * that the space and publishability gates empty entirely looks like no page at all — the budget
   * is never spent, and the sentinel walks the corpus exactly as it did before this hook existed.
   * A page arriving with nothing to show is the *definition* of barren, not a reason to stop
   * counting.
   */
  loaded: number;
  /** Rows actually on screen — what a new page is supposed to add to. */
  visible: number;
  /**
   * Whether the rows just fetched are still resolving into rows that can be shown.
   *
   * A tagged page arrives in two stages: the catalog lands, and then the lookup that says which of
   * it the viewer has already answered. Judged at the first stage every page looks barren, because
   * its rows are deliberately held back until the second — so a list that was finding claims on
   * every page still exhausted its budget and stopped. Accounting waits for the page to have
   * finished becoming itself.
   */
  settling: boolean;
  /**
   * Stop accounting entirely, keeping the budget for when the list comes back.
   *
   * For a surface whose paged list is not the one on screen. The debate-again flow warms its browse
   * catalogue from the opponent's tab, so `loaded` counted a page nobody was looking at against a
   * `visible` taken from a different tab's rows — marking the warm page barren, and then counting
   * it a second time when the warm-up ended, `loaded` fell to zero and Explore fetched it back from
   * cache. A budget can be spent before the viewer has opened the list at all.
   */
  paused?: boolean;
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
    // Nothing is judged mid-flight, and nothing at all while this list is not the one on screen.
    // Both return *before* the snapshot is updated, so the budget and the count it is measured
    // against come back exactly as they were left.
    //
    // A page is barren or not once it has finished arriving, and the second half of its arrival is
    // the lookup that decides which of its rows can be shown.
    if (paused || settling) return;

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
    // `resetKey` among them, though it is read during render rather than here: the reset zeroes the
    // snapshot, and without it in this list React has no reason to re-run when two corpora happen to
    // start at the same counts — two fifty-row pages that both collapse to nothing, say. The new
    // list's first barren page then went uncharged and the cap allowed a page more than it should.
  }, [loaded, paused, resetKey, settling, visible]);

  const keepLooking = React.useCallback(() => {
    setBarren(0);
    void fetchNextPage();
  }, [fetchNextPage]);

  const stoppedShort = hasNextPage && barren >= AUTO_PAGES_WITHOUT_ROWS;

  return { autoPages: hasNextPage && !stoppedShort, stoppedShort, keepLooking };
}

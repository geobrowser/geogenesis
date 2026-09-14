import { act, renderHook } from '@testing-library/react';

import { describe, expect, it, vi } from 'vitest';

import { AUTO_PAGES_WITHOUT_ROWS, useBoundedPaging } from './use-bounded-paging';

type Props = {
  loaded: number;
  visible: number;
  settling?: boolean;
  paused?: boolean;
  hasNextPage?: boolean;
  resetKey?: string;
};

function render(initial: Props, fetchNextPage = vi.fn()) {
  const view = renderHook(
    ({ loaded, visible, settling = false, paused = false, hasNextPage = true, resetKey = 'list' }: Props) =>
      useBoundedPaging({ loaded, visible, settling, paused, hasNextPage, fetchNextPage, resetKey }),
    { initialProps: initial }
  );

  return { ...view, fetchNextPage };
}

/** Pages that arrive with nothing the viewer can see, which is what the budget is spent on. */
function barrenPages(view: ReturnType<typeof render>, count: number, from = 0) {
  for (let page = 1; page <= count; page += 1) {
    view.rerender({ loaded: from + page * 50, visible: 0 });
  }
}

describe('useBoundedPaging', () => {
  it('advances on its own while there are pages to fetch', () => {
    const { result } = render({ loaded: 50, visible: 10 });

    expect(result.current.autoPages).toBe(true);
    expect(result.current.stoppedShort).toBe(false);
  });

  /**
   * The runaway this exists for: the filter empties each page as it lands, the sentinel never
   * leaves the viewport, and the list fetches the entire corpus fifty claims at a time.
   */
  it('stops advancing once enough pages have turned up nothing', () => {
    const view = render({ loaded: 0, visible: 0 });

    barrenPages(view, AUTO_PAGES_WITHOUT_ROWS);

    expect(view.result.current.autoPages).toBe(false);
    expect(view.result.current.stoppedShort).toBe(true);
  });

  // A search that is finding things is not the one being bounded.
  it('spends nothing on a page that turns something up', () => {
    const view = render({ loaded: 0, visible: 0 });

    barrenPages(view, AUTO_PAGES_WITHOUT_ROWS - 1);
    view.rerender({ loaded: 250, visible: 3 });
    barrenPages(view, AUTO_PAGES_WITHOUT_ROWS - 1, 250);

    expect(view.result.current.autoPages).toBe(true);
  });

  /**
   * Rows leaving is not a fetch. The viewer answering a claim, or narrowing the list, removes rows
   * without a page having landed — and counting that would spend their budget on their own typing.
   */
  it('spends nothing when rows leave without a page arriving', () => {
    const view = render({ loaded: 50, visible: 5 });

    for (let tick = 0; tick < AUTO_PAGES_WITHOUT_ROWS * 2; tick += 1) {
      view.rerender({ loaded: 50, visible: 0 });
    }

    expect(view.result.current.autoPages).toBe(true);
  });

  /**
   * A tagged page lands in two stages, and only the second says whether it was worth fetching.
   *
   * The catalog arrives first and its rows are held back until the lookup that classifies them
   * returns, so judged on arrival *every* page is barren — and a list finding claims on every one
   * of them still ran out of budget and stopped, for every viewer rather than the ones the bound is
   * for.
   */
  it('waits for a page to finish arriving before calling it barren', () => {
    const view = render({ loaded: 0, visible: 0 });

    for (let page = 1; page <= AUTO_PAGES_WITHOUT_ROWS + 2; page += 1) {
      // The catalog lands; its rows are not classified yet, so none of them can be shown.
      view.rerender({ loaded: page * 50, visible: page - 1, settling: true });
      // The lookup returns and the page turns out to have had something on it after all.
      view.rerender({ loaded: page * 50, visible: page, settling: false });
    }

    expect(view.result.current.autoPages).toBe(true);
  });

  /**
   * A list nobody is looking at spends nothing.
   *
   * The debate-again flow warms its browse catalogue from the opponent's tab, so while the viewer is
   * elsewhere `loaded` describes one list and `visible` another — and the budget was spent on pages
   * nobody had asked for, before Explore was ever opened.
   */
  describe('while the paged list is not the one on screen', () => {
    it('spends nothing on it', () => {
      const view = render({ loaded: 0, visible: 0 });

      for (let page = 1; page <= AUTO_PAGES_WITHOUT_ROWS + 2; page += 1) {
        view.rerender({ loaded: page * 50, visible: 0, paused: true });
      }

      expect(view.result.current.autoPages).toBe(true);
    });

    // And the page it warmed is not counted twice — once while away, once on arrival — which is
    // what happens if the snapshot moves while nobody is measuring against it.
    it('counts the warmed page once, when the viewer arrives', () => {
      const view = render({ loaded: 0, visible: 0 });

      // Warmed while away, then dropped when the warm-up ends, then fetched back from cache.
      view.rerender({ loaded: 50, visible: 0, paused: true });
      view.rerender({ loaded: 0, visible: 0, paused: true });
      view.rerender({ loaded: 50, visible: 0 });

      // One barren page spent, not two — so four more are still available.
      for (let page = 2; page <= AUTO_PAGES_WITHOUT_ROWS - 1; page += 1) {
        view.rerender({ loaded: page * 50, visible: 0 });
      }
      expect(view.result.current.autoPages).toBe(true);

      view.rerender({ loaded: AUTO_PAGES_WITHOUT_ROWS * 50, visible: 0 });
      expect(view.result.current.autoPages).toBe(false);
    });
  });

  it('gives the viewer a way to go on, and a fresh budget with it', () => {
    const view = render({ loaded: 0, visible: 0 });
    barrenPages(view, AUTO_PAGES_WITHOUT_ROWS);

    act(() => view.result.current.keepLooking());

    expect(view.fetchNextPage).toHaveBeenCalled();
    expect(view.result.current.autoPages).toBe(true);
  });

  // A different list is a different corpus to search, and gets its own budget to search it with.
  it('starts over for a new list', () => {
    const view = render({ loaded: 0, visible: 0 });
    barrenPages(view, AUTO_PAGES_WITHOUT_ROWS);

    view.rerender({ loaded: 0, visible: 0, resetKey: 'another list' });

    expect(view.result.current.autoPages).toBe(true);
  });

  // Reaching the end of the corpus is not stopping short of it, and must not offer to go on.
  it('does not report stopping short when there is nothing left to fetch', () => {
    const view = render({ loaded: 0, visible: 0 });
    barrenPages(view, AUTO_PAGES_WITHOUT_ROWS);

    view.rerender({ loaded: 250, visible: 0, hasNextPage: false });

    expect(view.result.current.stoppedShort).toBe(false);
    expect(view.result.current.autoPages).toBe(false);
  });
});

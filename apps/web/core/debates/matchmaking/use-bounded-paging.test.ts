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
/** A catalog page, as the tagged query fetches them. */
const PAGE = 50;

function barrenPages(view: ReturnType<typeof render>, count: number, from = 0, resetKey?: string) {
  for (let page = 1; page <= count; page += 1) {
    view.rerender({ loaded: from + page * PAGE, visible: 0, resetKey });
  }
}

describe('useBoundedPaging', () => {
  it('advances on its own while there are pages to fetch', () => {
    const { result } = render({ loaded: PAGE, visible: 10 });

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

    // One short of the cap, then a page with something on it, then one short of the cap again.
    // Counted from the constant rather than written out: this case is about the reset, and a page
    // number that quietly stopped being the next one turned it into a case about nothing.
    const upToTheCap = (AUTO_PAGES_WITHOUT_ROWS - 1) * PAGE;
    barrenPages(view, AUTO_PAGES_WITHOUT_ROWS - 1);
    view.rerender({ loaded: upToTheCap + PAGE, visible: 3 });
    barrenPages(view, AUTO_PAGES_WITHOUT_ROWS - 1, upToTheCap + PAGE);

    expect(view.result.current.autoPages).toBe(true);
  });

  /**
   * Rows leaving is not a fetch. The viewer answering a claim, or narrowing the list, removes rows
   * without a page having landed — and counting that would spend their budget on their own typing.
   */
  it('spends nothing when rows leave without a page arriving', () => {
    const view = render({ loaded: PAGE, visible: 5 });

    for (let tick = 0; tick < AUTO_PAGES_WITHOUT_ROWS * 2; tick += 1) {
      view.rerender({ loaded: PAGE, visible: 0 });
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
      view.rerender({ loaded: page * PAGE, visible: page - 1, settling: true });
      // The lookup returns and the page turns out to have had something on it after all.
      view.rerender({ loaded: page * PAGE, visible: page, settling: false });
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
        view.rerender({ loaded: page * PAGE, visible: 0, paused: true });
      }

      expect(view.result.current.autoPages).toBe(true);
    });

    // And the page it warmed is not counted twice — once while away, once on arrival — which is
    // what happens if the snapshot moves while nobody is measuring against it.
    it('counts the warmed page once, when the viewer arrives', () => {
      const view = render({ loaded: 0, visible: 0 });

      // Warmed while away, then dropped when the warm-up ends, then fetched back from cache.
      view.rerender({ loaded: PAGE, visible: 0, paused: true });
      view.rerender({ loaded: 0, visible: 0, paused: true });
      view.rerender({ loaded: PAGE, visible: 0 });

      // One barren page spent, not two — so four more are still available.
      for (let page = 2; page <= AUTO_PAGES_WITHOUT_ROWS - 1; page += 1) {
        view.rerender({ loaded: page * PAGE, visible: 0 });
      }
      expect(view.result.current.autoPages).toBe(true);

      view.rerender({ loaded: AUTO_PAGES_WITHOUT_ROWS * PAGE, visible: 0 });
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

  /**
   * And charges the new list for its own first page.
   *
   * Two corpora can start at identical counts — two fifty-row pages that both collapse to nothing —
   * and the reset happens during render while the accounting happens in an effect. With nothing in
   * that effect's inputs having changed, it never ran for the new list, so its opening page went
   * uncharged and the cap allowed one page more than it should.
   */
  it('charges a new list for the page it starts on', () => {
    const view = render({ loaded: 0, visible: 0 });
    barrenPages(view, AUTO_PAGES_WITHOUT_ROWS);

    // The same counts as the previous list reached, under a new key.
    view.rerender({ loaded: AUTO_PAGES_WITHOUT_ROWS * PAGE, visible: 0, resetKey: 'another list' });
    // One page in already, so the budget runs out one page sooner than a standing start.
    barrenPages(view, AUTO_PAGES_WITHOUT_ROWS - 1, AUTO_PAGES_WITHOUT_ROWS * PAGE, 'another list');

    expect(view.result.current.autoPages).toBe(false);
  });

  // Reaching the end of the corpus is not stopping short of it, and must not offer to go on.
  it('does not report stopping short when there is nothing left to fetch', () => {
    const view = render({ loaded: 0, visible: 0 });
    barrenPages(view, AUTO_PAGES_WITHOUT_ROWS);

    view.rerender({ loaded: AUTO_PAGES_WITHOUT_ROWS * PAGE, visible: 0, hasNextPage: false });

    expect(view.result.current.stoppedShort).toBe(false);
    expect(view.result.current.autoPages).toBe(false);
  });
});

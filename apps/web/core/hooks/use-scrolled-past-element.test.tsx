import { act, cleanup, render as renderComponent, renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useScrolledPastElement } from './use-scrolled-past-element';

type ObserverRecord = {
  callback: IntersectionObserverCallback;
  disconnect: Mock<() => void>;
  observed: Element[];
  options?: IntersectionObserverInit;
  observer: IntersectionObserver;
};

let observers: ObserverRecord[] = [];

const SELECTOR = '[data-entity-page-title="entity-1"]';
const TOP_OFFSET = 44;

beforeEach(() => {
  observers = [];

  class MockIntersectionObserver implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = '0px';
    readonly scrollMargin = '0px';
    readonly thresholds = [0];
    private readonly record: ObserverRecord;

    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      this.record = { callback, disconnect: vi.fn(), observed: [], options, observer: this };
      observers.push(this.record);
    }

    observe(element: Element) {
      this.record.observed.push(element);
    }

    unobserve(element: Element) {
      this.record.observed = this.record.observed.filter(observed => observed !== element);
    }

    disconnect() {
      this.record.disconnect();
      this.record.observed = [];
    }

    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

function addTitle(id = 'entity-1') {
  const title = document.createElement('h1');
  title.setAttribute('data-entity-page-title', id);
  document.body.append(title);
  return title;
}

/** jsdom lays nothing out, so a title's position on screen has to be stated. */
function atViewportBottom(element: Element, bottom: number) {
  element.getBoundingClientRect = () =>
    ({
      x: 0,
      y: bottom - 30,
      left: 0,
      right: 300,
      top: bottom - 30,
      bottom,
      width: 300,
      height: 30,
      toJSON: () => ({}),
    }) as DOMRect;
  return element;
}

function latestObserver() {
  const record = observers.at(-1);
  if (!record) throw new Error('Expected an IntersectionObserver to have been created');
  return record;
}

/** One notification, with the geometry that separates "above the fold" from "below it". */
function notify(record: ObserverRecord, target: Element, ...entries: { isIntersecting: boolean; bottom: number }[]) {
  act(() => {
    record.callback(
      entries.map(
        ({ isIntersecting, bottom }, index) =>
          ({
            target,
            time: index,
            isIntersecting,
            intersectionRatio: isIntersecting ? 1 : 0,
            boundingClientRect: { bottom } as DOMRectReadOnly,
          }) as IntersectionObserverEntry
      ),
      record.observer
    );
  });
}

function render(enabled = true) {
  return renderHook(() => useScrolledPastElement({ selector: SELECTOR, topOffset: TOP_OFFSET, enabled }));
}

function renderForSelector(selector: string) {
  return renderHook(({ selector }) => useScrolledPastElement({ selector, topOffset: TOP_OFFSET }), {
    initialProps: { selector },
  });
}

describe('useScrolledPastElement', () => {
  it('observes the matching element below the docked offset', () => {
    const title = addTitle();
    render();

    const record = latestObserver();
    expect(record.observed).toEqual([title]);
    expect(record.options).toEqual({ root: null, rootMargin: `-${TOP_OFFSET}px 0px 0px 0px`, threshold: 0 });
  });

  it('is true once the element has left the viewport upwards', () => {
    const title = addTitle();
    const { result } = render();

    expect(result.current.scrolledPast).toBe(false);
    notify(latestObserver(), title, { isIntersecting: false, bottom: -120 });
    expect(result.current.scrolledPast).toBe(true);
  });

  it('stays false for an element that is merely out of view below the fold', () => {
    const title = addTitle();
    const { result } = render();

    // Not intersecting, but still ahead of the reader — raising the bar here would announce a
    // title nobody has scrolled to yet.
    notify(latestObserver(), title, { isIntersecting: false, bottom: 2400 });
    expect(result.current.scrolledPast).toBe(false);
  });

  it('goes back to false when the element scrolls into view again', () => {
    const title = addTitle();
    const { result } = render();

    notify(latestObserver(), title, { isIntersecting: false, bottom: -120 });
    expect(result.current.scrolledPast).toBe(true);

    notify(latestObserver(), title, { isIntersecting: true, bottom: 200 });
    expect(result.current.scrolledPast).toBe(false);
  });

  it('follows the last transition when several are batched', () => {
    const title = addTitle();
    const { result } = render();

    notify(latestObserver(), title, { isIntersecting: false, bottom: -120 }, { isIntersecting: true, bottom: 200 });
    expect(result.current.scrolledPast).toBe(false);
  });

  it('picks up a title that mounts after it starts watching', async () => {
    const { result } = render();
    expect(latestObserver().observed).toEqual([]);

    const title = addTitle();
    await waitFor(() => expect(latestObserver().observed).toEqual([title]));

    notify(latestObserver(), title, { isIntersecting: false, bottom: -120 });
    expect(result.current.scrolledPast).toBe(true);
  });

  it('clears when the watched title is removed from the document', async () => {
    const title = addTitle();
    const { result } = render();

    notify(latestObserver(), title, { isIntersecting: false, bottom: -120 });
    expect(result.current.scrolledPast).toBe(true);

    act(() => title.remove());
    await waitFor(() => expect(result.current.scrolledPast).toBe(false));
  });

  it('ignores a title belonging to some other entity', () => {
    addTitle('entity-2');
    render();

    expect(latestObserver().observed).toEqual([]);
  });

  it('watches nothing while disabled', () => {
    addTitle();
    const { result } = render(false);

    expect(observers).toHaveLength(0);
    expect(result.current.scrolledPast).toBe(false);
  });

  /**
   * Moving between two entities. The next one's title is not in the document at the moment the
   * selector changes, and `next === watched` is true when both are null — so without an explicit
   * reset the previous entity's answer stood, opening the new page with the bar already up and the
   * old, detached title still being handed out for measuring.
   */
  it('forgets the previous entity when the selector changes', async () => {
    const title = addTitle('entity-1');
    const { result, rerender } = renderForSelector('[data-entity-page-title="entity-1"]');

    notify(latestObserver(), title, { isIntersecting: false, bottom: -120 });
    expect(result.current.scrolledPast).toBe(true);

    // The old title goes with the old page; the new one has not mounted yet.
    act(() => title.remove());
    rerender({ selector: '[data-entity-page-title="entity-2"]' });

    await waitFor(() => expect(result.current.scrolledPast).toBe(false));
    expect(result.current.target).toBeNull();
  });

  /**
   * One lookup a frame. While a title is mounted `sync` is a connectedness test, but a route that
   * draws none — the debates feed — would otherwise query the document on every mutation batch, and
   * that feed mutates continuously.
   */
  it('coalesces document lookups when there is no title to find', async () => {
    const querySelector = vi.spyOn(document, 'querySelector');
    render();
    const initialLookups = querySelector.mock.calls.length;

    act(() => {
      for (let index = 0; index < 20; index++) {
        document.body.append(document.createElement('div'));
      }
    });

    await waitFor(() => expect(querySelector.mock.calls.length).toBeGreaterThan(initialLookups));
    // One frame's worth, not one per mutation batch.
    expect(querySelector.mock.calls.length - initialLookups).toBeLessThanOrEqual(2);
    querySelector.mockRestore();
  });

  /**
   * What each *commit* carried, not what settled afterwards and not every render call.
   *
   * Recorded in a layout effect on purpose. Reading `result.current` after `rerender` cannot see a
   * value that was painted and then corrected, which is the value in question — but recording during
   * render would over-report the other way, since a state adjustment made during render makes React
   * re-run the component and throw the first pass away without ever committing it. A layout effect
   * runs once per commit, before the browser paints, so this is exactly the set of values a reader
   * could have seen.
   */
  function captureCommits() {
    const commits: { selector: string; scrolledPast: boolean; hasTarget: boolean }[] = [];

    function Probe({ selector }: { selector: string }) {
      const { scrolledPast, target } = useScrolledPastElement({ selector, topOffset: TOP_OFFSET });
      React.useLayoutEffect(() => {
        commits.push({ selector, scrolledPast, hasTarget: target !== null });
      });
      return null;
    }

    return { commits, Probe };
  }

  /**
   * A reset in a passive effect runs *after* the browser has painted, so the render that first sees
   * the new selector still returns the previous entity's answer. On a client-side navigation to an
   * already-hydrated entity that paints its bar for a frame, over a page whose title has never been
   * observed. Derived during render instead, so there is no frame to paint.
   */
  it('never returns the previous entity’s answer under the new selector', async () => {
    const title = addTitle('entity-1');
    const { commits, Probe } = captureCommits();
    const view = renderComponent(<Probe selector='[data-entity-page-title="entity-1"]' />);

    notify(latestObserver(), title, { isIntersecting: false, bottom: -120 });
    expect(commits.at(-1)).toMatchObject({ scrolledPast: true });

    act(() => title.remove());
    view.rerender(<Probe selector='[data-entity-page-title="entity-2"]' />);

    const underNewSelector = commits.filter(entry => entry.selector === '[data-entity-page-title="entity-2"]');
    expect(underNewSelector.length).toBeGreaterThan(0);
    expect(underNewSelector.every(entry => entry.scrolledPast === false)).toBe(true);
    expect(underNewSelector.every(entry => entry.hasTarget === false)).toBe(true);
  });

  /**
   * A tab swaps the title for another element belonging to the same entity, so the selector never
   * changes and the render-time reset above never runs. The old element's answer is not about the
   * new one, and `IntersectionObserver` does not report on a freshly observed element until a task
   * later — long enough to paint the bar over a title sitting at the top of a newly opened tab.
   */
  it('does not carry a scrolled answer onto a title swapped in under the same selector', async () => {
    const first = atViewportBottom(addTitle(), -200);
    const { result } = render();

    notify(latestObserver(), first, { isIntersecting: false, bottom: -200 });
    expect(result.current.scrolledPast).toBe(true);

    // The tab swaps the title, and the new one sits in view. No notification yet.
    act(() => first.remove());
    const second = atViewportBottom(addTitle(), 300);
    await waitFor(() => expect(result.current.target).toBe(second));

    expect(result.current.scrolledPast).toBe(false);
  });

  /**
   * And the other direction, which a blind clear would get wrong: the element swapped in is already
   * above the fold, so the answer is `true` from the first frame rather than after the observer
   * catches up. Measuring the new target is what covers both.
   */
  it('reports a title swapped in already above the fold without waiting for the observer', async () => {
    const first = atViewportBottom(addTitle(), 300);
    const { result } = render();

    notify(latestObserver(), first, { isIntersecting: true, bottom: 300 });
    expect(result.current.scrolledPast).toBe(false);

    act(() => first.remove());
    const second = atViewportBottom(addTitle(), -120);
    await waitFor(() => expect(result.current.target).toBe(second));

    expect(result.current.scrolledPast).toBe(true);
  });

  it('stays false when IntersectionObserver is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    addTitle();

    expect(render().result.current.scrolledPast).toBe(false);
  });

  /**
   * Handed back as well as watched, so the sticky header can measure the content column around it
   * without mounting a second `MutationObserver` over the body to find the same element again.
   */
  it('hands back the element it is watching', async () => {
    const { result } = render();
    expect(result.current.target).toBeNull();

    const title = addTitle();
    await waitFor(() => expect(result.current.target).toBe(title));

    act(() => title.remove());
    await waitFor(() => expect(result.current.target).toBeNull());
  });
});

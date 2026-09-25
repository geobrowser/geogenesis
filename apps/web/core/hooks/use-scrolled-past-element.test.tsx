import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

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

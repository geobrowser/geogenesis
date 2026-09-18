import { act, cleanup, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useNearViewport } from './use-near-viewport';

type ObserverRecord = {
  callback: IntersectionObserverCallback;
  disconnect: ReturnType<typeof vi.fn>;
  element: Element | null;
  options?: IntersectionObserverInit;
  observer: IntersectionObserver;
};

let observers: ObserverRecord[] = [];

beforeEach(() => {
  observers = [];

  class MockIntersectionObserver implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = '0px';
    readonly scrollMargin = '0px';
    readonly thresholds = [0];
    private readonly record: ObserverRecord;

    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      this.record = { callback, disconnect: vi.fn(), element: null, options, observer: this };
      observers.push(this.record);
    }

    observe(element: Element) {
      this.record.element = element;
    }

    unobserve(element: Element) {
      if (this.record.element === element) this.record.element = null;
    }

    disconnect() {
      this.record.disconnect();
      this.record.element = null;
    }

    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderObservedHook(options?: Parameters<typeof useNearViewport>[0]) {
  const target = document.createElement('div');
  const hook = renderHook(() => useNearViewport(options));
  act(() => hook.result.current.ref(target));
  const record = observers.at(-1);
  if (!record) throw new Error('Expected useNearViewport to create an observer');
  return { ...hook, record, target };
}

function notify(record: ObserverRecord, target: Element, ...states: boolean[]) {
  act(() => {
    record.callback(
      states.map(
        (isIntersecting, index) =>
          ({
            target,
            time: index,
            isIntersecting,
            intersectionRatio: isIntersecting ? 1 : 0,
          }) as IntersectionObserverEntry
      ),
      record.observer
    );
  });
}

describe('useNearViewport', () => {
  it('is sticky by default and disconnects after the element enters range', () => {
    const { result, record, target } = renderObservedHook();

    // Sticky means "ever near": a batched enter followed by an exit still counts.
    notify(record, target, true, false);

    expect(result.current.nearViewport).toBe(true);
    expect(record.disconnect).toHaveBeenCalledOnce();
  });

  it('tracks both entry and exit when sticky mode is disabled', () => {
    const { result, record, target } = renderObservedHook({ rootMargin: '400px', sticky: false });

    expect(record.options).toEqual({ rootMargin: '400px' });
    notify(record, target, true);
    expect(result.current.nearViewport).toBe(true);

    notify(record, target, false);
    expect(result.current.nearViewport).toBe(false);
    expect(record.disconnect).not.toHaveBeenCalled();
  });

  it('uses the latest transition when reversible notifications are batched', () => {
    const { result, record, target } = renderObservedHook({ sticky: false });

    notify(record, target, true, false);
    expect(result.current.nearViewport).toBe(false);

    notify(record, target, false, true);
    expect(result.current.nearViewport).toBe(true);
    expect(record.disconnect).not.toHaveBeenCalled();
  });

  it('fails open when IntersectionObserver is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { result } = renderHook(() => useNearViewport());

    expect(result.current.nearViewport).toBe(true);
  });
});

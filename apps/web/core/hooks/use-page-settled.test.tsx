import { act, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SETTLE_IDLE_TIMEOUT_MS,
  SETTLE_LCP_QUIET_MS,
  SETTLE_MAX_WAIT_MS,
  resetPageSettledForTests,
  usePageSettled,
} from './use-page-settled';

const setReadyState = (value: DocumentReadyState) =>
  Object.defineProperty(document, 'readyState', { configurable: true, get: () => value });

describe('usePageSettled', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetPageSettledForTests();
    // jsdom has no requestIdleCallback; the Safari path (a short timer) is the default here.
    Reflect.deleteProperty(window, 'requestIdleCallback');
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(document, 'readyState');
    resetPageSettledForTests();
  });

  it('stays unsettled until the window has loaded', () => {
    setReadyState('loading');
    const { result } = renderHook(() => usePageSettled());
    act(() => {
      vi.advanceTimersByTime(SETTLE_MAX_WAIT_MS - 1);
    });
    expect(result.current).toBe(false);
  });

  it('settles shortly after load when there is no idle callback', () => {
    setReadyState('loading');
    const { result } = renderHook(() => usePageSettled());
    act(() => {
      window.dispatchEvent(new Event('load'));
    });
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(SETTLE_LCP_QUIET_MS);
    });
    expect(result.current).toBe(true);
  });

  it('settles on an idle callback after load, with a timeout', () => {
    setReadyState('loading');
    const requestIdleCallback = vi.fn((callback: IdleRequestCallback) => {
      callback({ didTimeout: false, timeRemaining: () => 10 });
      return 1;
    });
    Object.defineProperty(window, 'requestIdleCallback', { configurable: true, value: requestIdleCallback });
    const { result } = renderHook(() => usePageSettled());
    act(() => {
      window.dispatchEvent(new Event('load'));
    });
    expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: SETTLE_IDLE_TIMEOUT_MS });
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(SETTLE_LCP_QUIET_MS);
    });
    expect(result.current).toBe(true);
  });

  it('keeps waiting while new largest-contentful-paint candidates arrive', () => {
    setReadyState('complete');
    let notify: (list: { getEntries: () => { startTime: number }[] }) => void = () => {};
    class FakeObserver {
      constructor(callback: typeof notify) {
        notify = callback;
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('PerformanceObserver', FakeObserver);
    const { result } = renderHook(() => usePageSettled());
    act(() => {
      vi.advanceTimersByTime(300);
    });
    // A candidate lands just before the quiet window would have closed.
    act(() => {
      notify({ getEntries: () => [{ startTime: performance.now() + SETTLE_LCP_QUIET_MS - 100 }] });
      vi.advanceTimersByTime(SETTLE_LCP_QUIET_MS);
    });
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(SETTLE_LCP_QUIET_MS);
    });
    expect(result.current).toBe(true);
    vi.unstubAllGlobals();
  });

  it('settles on the first touch, wheel or key before the page has loaded', () => {
    setReadyState('loading');
    const { result } = renderHook(() => usePageSettled());
    act(() => {
      window.dispatchEvent(new Event('touchstart'));
    });
    expect(result.current).toBe(true);
  });

  it('does not treat a scroll event as a person, since scroll restoration fires one', () => {
    setReadyState('loading');
    const { result } = renderHook(() => usePageSettled());
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(result.current).toBe(false);
  });

  it('gives up waiting after the cap, so a load that never comes cannot keep videos off', () => {
    setReadyState('loading');
    const { result } = renderHook(() => usePageSettled());
    act(() => {
      vi.advanceTimersByTime(SETTLE_MAX_WAIT_MS);
    });
    expect(result.current).toBe(true);
  });

  it('stays settled for a hook mounted later, as on a navigation inside the app', () => {
    setReadyState('complete');
    const first = renderHook(() => usePageSettled());
    act(() => {
      vi.advanceTimersByTime(250 + SETTLE_LCP_QUIET_MS);
    });
    expect(first.result.current).toBe(true);
    first.unmount();
    expect(renderHook(() => usePageSettled()).result.current).toBe(true);
  });
});

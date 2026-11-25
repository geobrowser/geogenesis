import { act, renderHook } from '@testing-library/react';

import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { useInitialHydrationGate } from './use-initial-hydration-gate';

/** What the gate says in a server render, where effects never run. */
function serverGate(isBusy: boolean, options?: { revealSettledBeforeMount?: boolean }): string {
  function Probe() {
    const gated = useInitialHydrationGate(isBusy, 'topic:space:entity', 950, options);
    return <span>{gated ? 'gated' : 'open'}</span>;
  }
  return renderToString(<Probe />);
}

describe('useInitialHydrationGate', () => {
  it('holds the server render by default, even when nothing is loading', () => {
    expect(serverGate(false)).toContain('gated');
  });

  it('opens the server render when settled and the caller opts in', () => {
    expect(serverGate(false, { revealSettledBeforeMount: true })).toContain('open');
  });

  it('holds the server render while something is loading, opted in or not', () => {
    expect(serverGate(true, { revealSettledBeforeMount: true })).toContain('gated');
    expect(serverGate(true)).toContain('gated');
  });

  it('opens the first client render when settled and opted in, and stays open through a refetch', () => {
    const { result, rerender } = renderHook(
      ({ isBusy }) => useInitialHydrationGate(isBusy, 'k', 950, { revealSettledBeforeMount: true }),
      { initialProps: { isBusy: false } }
    );
    expect(result.current).toBe(false);
    rerender({ isBusy: true });
    expect(result.current).toBe(false);
  });

  it('records the first client render as open when settled and opted in', () => {
    const seen: boolean[] = [];
    renderHook(() => {
      const gated = useInitialHydrationGate(false, 'k', 950, { revealSettledBeforeMount: true });
      seen.push(gated);
      return gated;
    });
    expect(seen.every(gated => !gated)).toBe(true);
  });

  it('still waits for the reads to settle when they are loading at first render', () => {
    const { result, rerender } = renderHook(
      ({ isBusy }) => useInitialHydrationGate(isBusy, 'k', 950, { revealSettledBeforeMount: true }),
      { initialProps: { isBusy: true } }
    );
    expect(result.current).toBe(true);
    rerender({ isBusy: false });
    expect(result.current).toBe(false);
    rerender({ isBusy: true });
    expect(result.current).toBe(false);
  });

  it('releases a slow read after the wait', () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useInitialHydrationGate(true, 'k', 500, { revealSettledBeforeMount: true }));
      expect(result.current).toBe(true);
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(result.current).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('gates again for a new key until that key settles', () => {
    const { result, rerender } = renderHook(
      ({ isBusy, k }) => useInitialHydrationGate(isBusy, k, 950, { revealSettledBeforeMount: true }),
      { initialProps: { isBusy: false, k: 'a' } }
    );
    expect(result.current).toBe(false);
    rerender({ isBusy: true, k: 'b' });
    expect(result.current).toBe(true);
    rerender({ isBusy: false, k: 'b' });
    expect(result.current).toBe(false);
  });

  it('keeps the old behaviour without the option: held until mounted', () => {
    const seen: boolean[] = [];
    const { result } = renderHook(() => {
      const gated = useInitialHydrationGate(false, 'k');
      seen.push(gated);
      return gated;
    });
    expect(seen[0]).toBe(true);
    expect(result.current).toBe(false);
  });
});

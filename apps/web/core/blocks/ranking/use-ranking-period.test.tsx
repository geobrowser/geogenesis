import { act, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type RankingDate } from './ranking-block-dates';
import { useRankingPeriod } from './use-ranking-period';

const dt = (value: string): RankingDate => ({ value, isDateOnly: false });
const EMPTY: RankingDate = { value: '', isDateOnly: false };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useRankingPeriod', () => {
  it('re-evaluates against the current clock when dates arrive after the window already closed', () => {
    vi.setSystemTime(new Date('2026-06-03T00:00:00.000Z'));
    const { result, rerender } = renderHook(({ start, end }) => useRankingPeriod(start, end), {
      initialProps: { start: EMPTY, end: EMPTY },
    });
    expect(result.current.submissionsOpen).toBe(true); // no-date => open

    vi.setSystemTime(new Date('2026-06-10T00:00:00.000Z'));

    act(() => {
      rerender({ start: dt('2026-06-02T00:00:00.000Z'), end: dt('2026-06-05T00:00:00.000Z') });
    });

    expect(result.current.periodState).toBe('ended');
    expect(result.current.submissionsOpen).toBe(false);
  });

  it('advances to ended when the scheduled timer fires', () => {
    vi.setSystemTime(new Date('2026-06-04T12:00:00.000Z'));
    const { result } = renderHook(() =>
      useRankingPeriod(dt('2026-06-01T00:00:00.000Z'), dt('2026-06-04T12:00:05.000Z'))
    );
    expect(result.current.submissionsOpen).toBe(true); // in-progress, ends in 5s

    // Advancing the fake timers advances the clock and fires the boundary tick.
    act(() => {
      vi.advanceTimersByTime(6_000);
    });

    expect(result.current.periodState).toBe('ended');
    expect(result.current.submissionsOpen).toBe(false);
  });
});

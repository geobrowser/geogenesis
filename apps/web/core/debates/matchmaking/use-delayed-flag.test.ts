import { act, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDelayedFlag } from './use-delayed-flag';

describe('useDelayedFlag', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('stays false until the flag has been true for the whole delay', () => {
    const { result } = renderHook(() => useDelayedFlag(true, 250));

    expect(result.current).toBe(false);

    act(() => void vi.advanceTimersByTime(249));
    expect(result.current).toBe(false);

    act(() => void vi.advanceTimersByTime(1));
    expect(result.current).toBe(true);
  });

  // The point of the hook: work that finishes inside the window never shows a placeholder at all.
  it('never turns true for a flag that drops before the delay is up', () => {
    const { result, rerender } = renderHook(({ value }) => useDelayedFlag(value, 250), {
      initialProps: { value: true },
    });

    act(() => void vi.advanceTimersByTime(200));
    rerender({ value: false });
    act(() => void vi.advanceTimersByTime(500));

    expect(result.current).toBe(false);
  });

  it('drops immediately once the flag does, with no delay on the way down', () => {
    const { result, rerender } = renderHook(({ value }) => useDelayedFlag(value, 250), {
      initialProps: { value: true },
    });

    act(() => void vi.advanceTimersByTime(250));
    expect(result.current).toBe(true);

    rerender({ value: false });
    expect(result.current).toBe(false);
  });

  // Each stretch is measured on its own — a second wait doesn't inherit credit from the first.
  it('restarts the delay when the flag goes true again', () => {
    const { result, rerender } = renderHook(({ value }) => useDelayedFlag(value, 250), {
      initialProps: { value: true },
    });

    act(() => void vi.advanceTimersByTime(250));
    rerender({ value: false });
    rerender({ value: true });

    expect(result.current).toBe(false);

    act(() => void vi.advanceTimersByTime(250));
    expect(result.current).toBe(true);
  });
});

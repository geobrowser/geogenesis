import { act, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SELECTION_DEBOUNCE_MS, useDebouncedSelection } from './use-debounced-selection';

describe('useDebouncedSelection', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('settles on the initial selection with nothing pending', () => {
    const { result } = renderHook(() => useDebouncedSelection([]));

    expect(result.current.value).toEqual([]);
    expect(result.current.pending).toBe(false);
  });

  it('holds the previous selection, and reports pending, until the delay is up', () => {
    const { result, rerender } = renderHook(({ ids }) => useDebouncedSelection(ids), {
      initialProps: { ids: ['topic-a'] },
    });

    rerender({ ids: ['topic-a', 'topic-b'] });

    expect(result.current.value).toEqual(['topic-a']);
    expect(result.current.pending).toBe(true);

    act(() => void vi.advanceTimersByTime(SELECTION_DEBOUNCE_MS));

    expect(result.current.value).toEqual(['topic-a', 'topic-b']);
    expect(result.current.pending).toBe(false);
  });

  // The run the debounce is for: three ticks in a row settle once, on the last of them.
  it('coalesces a run of ticks into the final selection', () => {
    const { result, rerender } = renderHook(({ ids }) => useDebouncedSelection(ids), {
      initialProps: { ids: [] as string[] },
    });

    rerender({ ids: ['topic-a'] });
    act(() => void vi.advanceTimersByTime(SELECTION_DEBOUNCE_MS - 20));
    rerender({ ids: ['topic-a', 'topic-b'] });
    act(() => void vi.advanceTimersByTime(SELECTION_DEBOUNCE_MS - 20));
    rerender({ ids: ['topic-a', 'topic-b', 'topic-c'] });

    expect(result.current.value).toEqual([]);

    act(() => void vi.advanceTimersByTime(SELECTION_DEBOUNCE_MS));

    expect(result.current.value).toEqual(['topic-a', 'topic-b', 'topic-c']);
    expect(result.current.pending).toBe(false);
  });

  // Compared by content, so a caller that rebuilds an equal list doesn't read as forever pending.
  it('treats an equal list rebuilt as a new array as settled', () => {
    const { result, rerender } = renderHook(({ ids }) => useDebouncedSelection(ids), {
      initialProps: { ids: ['topic-a'] },
    });

    act(() => void vi.advanceTimersByTime(SELECTION_DEBOUNCE_MS));
    rerender({ ids: ['topic-a'] });

    expect(result.current.pending).toBe(false);
  });

  // Order is the pick order (GEO-2654), so a reordered selection is a different one.
  it('reports pending when the same ids arrive in a different order', () => {
    const { result, rerender } = renderHook(({ ids }) => useDebouncedSelection(ids), {
      initialProps: { ids: ['topic-a', 'topic-b'] },
    });

    act(() => void vi.advanceTimersByTime(SELECTION_DEBOUNCE_MS));
    rerender({ ids: ['topic-b', 'topic-a'] });

    expect(result.current.pending).toBe(true);
  });
});

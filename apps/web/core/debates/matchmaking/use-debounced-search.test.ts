import { act, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SEARCH_DEBOUNCE_MS, useDebouncedSearch } from './use-debounced-search';

describe('useDebouncedSearch', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts empty with nothing pending', () => {
    const { result } = renderHook(() => useDebouncedSearch(''));

    expect(result.current.value).toBe('');
    expect(result.current.pending).toBe(false);
  });

  // The window the counts have to be covered for: the box says one thing, the request another.
  it('reports pending from the keystroke until the delay is up', () => {
    const { result, rerender } = renderHook(({ search }) => useDebouncedSearch(search), {
      initialProps: { search: '' },
    });

    rerender({ search: 'nuclear' });

    expect(result.current.value).toBe('');
    expect(result.current.pending).toBe(true);

    act(() => void vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));

    expect(result.current.value).toBe('nuclear');
    expect(result.current.pending).toBe(false);
  });

  it('coalesces a run of keystrokes into the final query', () => {
    const { result, rerender } = renderHook(({ search }) => useDebouncedSearch(search), {
      initialProps: { search: '' },
    });

    rerender({ search: 'nuc' });
    act(() => void vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 50));
    rerender({ search: 'nucle' });
    act(() => void vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 50));
    rerender({ search: 'nuclear' });

    expect(result.current.value).toBe('');

    act(() => void vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));

    expect(result.current.value).toBe('nuclear');
    expect(result.current.pending).toBe(false);
  });

  // Only the trimmed query is ever sent, so whitespace around a settled one has not changed it.
  it('does not call a settled query pending over surrounding whitespace', () => {
    const { result, rerender } = renderHook(({ search }) => useDebouncedSearch(search), {
      initialProps: { search: 'nuclear' },
    });

    act(() => void vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    rerender({ search: 'nuclear ' });

    expect(result.current.pending).toBe(false);
  });
});

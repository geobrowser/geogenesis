import { act, renderHook } from '@testing-library/react';

import { describe, expect, it } from 'vitest';

import { useChecklistExpansion } from './use-checklist-expansion';

describe('useChecklistExpansion', () => {
  it('stays open while there is work left', () => {
    const { result } = renderHook(() => useChecklistExpansion({ allComplete: false, isLoading: false }));

    expect(result.current.expanded).toBe(true);
  });

  // The ask: a finished checklist folds down rather than disappearing.
  it('folds itself away once everything is done', () => {
    const { result, rerender } = renderHook(props => useChecklistExpansion(props), {
      initialProps: { allComplete: false, isLoading: false },
    });
    expect(result.current.expanded).toBe(true);

    rerender({ allComplete: true, isLoading: false });

    expect(result.current.expanded).toBe(false);
  });

  // Completion reads false until it is known, so acting on it early would fold an unfinished
  // checklist shut and then flick it back open.
  it('does nothing while completion is still unknown', () => {
    const { result, rerender } = renderHook(props => useChecklistExpansion(props), {
      initialProps: { allComplete: true, isLoading: true },
    });

    expect(result.current.expanded).toBe(true);

    rerender({ allComplete: true, isLoading: false });
    expect(result.current.expanded).toBe(false);
  });

  it('opens again when the next reset brings work back', () => {
    const { result, rerender } = renderHook(props => useChecklistExpansion(props), {
      initialProps: { allComplete: true, isLoading: false },
    });
    expect(result.current.expanded).toBe(false);

    rerender({ allComplete: false, isLoading: false });

    expect(result.current.expanded).toBe(true);
  });

  it('leaves a finished checklist open once the reader opens it', () => {
    const { result, rerender } = renderHook(props => useChecklistExpansion(props), {
      initialProps: { allComplete: true, isLoading: false },
    });
    expect(result.current.expanded).toBe(false);

    act(() => result.current.onToggle());
    expect(result.current.expanded).toBe(true);

    // Completion reporting again must not slam it shut under them.
    rerender({ allComplete: true, isLoading: false });
    expect(result.current.expanded).toBe(true);
  });

  it('leaves an unfinished checklist closed once the reader closes it', () => {
    const { result, rerender } = renderHook(props => useChecklistExpansion(props), {
      initialProps: { allComplete: false, isLoading: false },
    });

    act(() => result.current.onToggle());
    expect(result.current.expanded).toBe(false);

    rerender({ allComplete: false, isLoading: false });
    expect(result.current.expanded).toBe(false);
  });
});

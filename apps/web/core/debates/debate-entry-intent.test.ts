import { act, cleanup, renderHook } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearEnteringDebate, markEnteringDebate, useEnteringDebateId } from './debate-entry-intent';
import { clearDebateReturnDestination } from './debate-return-navigation';

afterEach(() => {
  cleanup();
  clearEnteringDebate();
  clearDebateReturnDestination();
  vi.useRealTimers();
});

describe('debate entry intent', () => {
  it('holds the debate this tab is walking into', () => {
    const { result } = renderHook(() => useEnteringDebateId());
    expect(result.current).toBeNull();

    act(() => markEnteringDebate('debate-1'));

    expect(result.current).toBe('debate-1');
  });

  it('is released on arrival', () => {
    const { result } = renderHook(() => useEnteringDebateId());
    act(() => markEnteringDebate('debate-1'));

    act(() => clearEnteringDebate('debate-1'));

    expect(result.current).toBeNull();
  });

  // Otherwise a slow arrival could release the intent a second, faster accept had just taken.
  it('ignores a release for a debate it is no longer walking into', () => {
    const { result } = renderHook(() => useEnteringDebateId());
    act(() => markEnteringDebate('debate-1'));
    act(() => markEnteringDebate('debate-2'));

    act(() => clearEnteringDebate('debate-1'));

    expect(result.current).toBe('debate-2');
  });

  // The intent suppresses both the ready prompt and the rejoin bar, so a push that never lands must
  // not cost the viewer their only way into the room.
  it('expires rather than latching when the push never lands', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useEnteringDebateId());
    act(() => markEnteringDebate('debate-1'));

    act(() => vi.advanceTimersByTime(29_999));
    expect(result.current).toBe('debate-1');

    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBeNull();
  });

  // A second accept re-arms the timeout rather than inheriting what was left of the first one.
  it('gives a re-entered intent its full window', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useEnteringDebateId());
    act(() => markEnteringDebate('debate-1'));

    act(() => vi.advanceTimersByTime(25_000));
    act(() => markEnteringDebate('debate-2'));
    act(() => vi.advanceTimersByTime(25_000));

    expect(result.current).toBe('debate-2');
  });
});

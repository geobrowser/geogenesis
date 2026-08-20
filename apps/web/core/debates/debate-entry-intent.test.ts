import { act, cleanup, renderHook } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearEnteringDebate,
  markEnteringDebate,
  recordDebateFlowOrigin,
  takeDebateFlowOrigin,
  useEnteringDebateId,
} from './debate-entry-intent';

afterEach(() => {
  cleanup();
  clearEnteringDebate();
  window.sessionStorage.clear();
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

// GEO-2605. `router.back()` steps one history entry, which is the origin only when the flow was a
// single hop — so the origin is recorded on the way in rather than inferred on the way out.
describe('debate flow origin', () => {
  it('returns the path the flow started from', () => {
    recordDebateFlowOrigin('/space/space-1/entity-7');

    expect(takeDebateFlowOrigin()).toBe('/space/space-1/entity-7');
  });

  // The whole point: hub -> room -> rematch -> room must still return to the hub, not to the room
  // one entry back. Every entry calls markEnteringDebate, so the second one must not overwrite.
  it('keeps the first origin when the flow enters a second room', () => {
    recordDebateFlowOrigin('/space/space-1/entity-7');
    recordDebateFlowOrigin('/space/space-1/debates/debate-1');
    markEnteringDebate('debate-2');

    expect(takeDebateFlowOrigin()).toBe('/space/space-1/entity-7');
  });

  // A refresh mid-flow re-enters from a debate path. Recording it would make the room its own
  // origin, which sends the viewer straight back into the flow they were leaving.
  it('never records a path inside the flow', () => {
    recordDebateFlowOrigin('/space/space-1/debates');

    expect(takeDebateFlowOrigin()).toBeNull();
  });

  // Distinguishes the record-side guard from the read-side one: if an in-flow path were stored,
  // the already-held guard would then block the real origin and the exit would fall back.
  it('does not let a refresh inside the flow consume the origin slot', () => {
    recordDebateFlowOrigin('/space/space-1/debates/debate-1');
    recordDebateFlowOrigin('/space/space-1/entity-7');

    expect(takeDebateFlowOrigin()).toBe('/space/space-1/entity-7');
  });

  it('does not treat a path merely containing the word as the flow', () => {
    recordDebateFlowOrigin('/space/space-1/debatesomething');

    expect(takeDebateFlowOrigin()).toBe('/space/space-1/debatesomething');
  });

  it('forgets the origin once it has been used, so a later exit falls back', () => {
    recordDebateFlowOrigin('/space/space-1/entity-7');

    expect(takeDebateFlowOrigin()).toBe('/space/space-1/entity-7');
    expect(takeDebateFlowOrigin()).toBeNull();
  });

  it('has nothing to return to when the flow was never entered', () => {
    expect(takeDebateFlowOrigin()).toBeNull();
  });

  // Private-mode browsers throw on sessionStorage. Losing the origin is acceptable; taking the
  // room down on the way out is not.
  it('survives storage that throws', () => {
    // jsdom's Storage is a proxy whose methods live on the prototype, so spying on the instance
    // silently writes a storage entry instead of replacing the method. Swap the whole object.
    const real = window.sessionStorage;
    const denied = () => {
      throw new Error('denied');
    };
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: { getItem: denied, setItem: denied, removeItem: denied },
    });

    try {
      expect(() => recordDebateFlowOrigin('/space/space-1/entity-7')).not.toThrow();
      expect(takeDebateFlowOrigin()).toBeNull();
    } finally {
      Object.defineProperty(window, 'sessionStorage', { configurable: true, value: real });
    }
  });
});

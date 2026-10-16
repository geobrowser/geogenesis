import { act, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { advanceBreakClock, usePlaybackAnimationClock } from './use-playback-animation-clock';

let nextFrame: FrameRequestCallback | null;
beforeEach(() => {
  nextFrame = null;
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      nextFrame = callback;
      return 1;
    })
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn(() => {
      nextFrame = null;
    })
  );
});
afterEach(() => vi.unstubAllGlobals());

const frame = (now: number) => act(() => nextFrame?.(now));

describe('playback animation clock', () => {
  it('tracks media frames without a React sample, holds through a stall, and follows a seek', () => {
    const element = document.createElement('div');
    const ref = { current: element };
    let live = 60_100;
    const source = { positionMs: () => live, originMs: 60_000 };
    const { unmount } = renderHook(() =>
      usePlaybackAnimationClock(ref, { elapsedMs: 100, playedMs: 3_000 }, true, source)
    );
    const time = () => Number(element.style.getPropertyValue('--break-t'));
    expect(time()).toBe(100);
    live = 60_116;
    frame(16);
    expect(time()).toBe(116);
    frame(1_016);
    expect(time()).toBe(116);
    live = 62_100;
    frame(1_032);
    expect(time()).toBe(2_100);
    live = 60_050;
    frame(1_048);
    expect(time()).toBe(50);
    unmount();
    expect(nextFrame).toBeNull();
  });

  it('pauses at the actual media frame and resumes from it without rewinding to a stale sample', () => {
    const element = document.createElement('div');
    const ref = { current: element };
    let live = 100;
    const source = { positionMs: () => live, originMs: 0 };
    const { rerender } = renderHook(
      ({ playing }) => usePlaybackAnimationClock(ref, { elapsedMs: 100, playedMs: 1_800 }, playing, source),
      { initialProps: { playing: true } }
    );
    live = 180;
    frame(80);
    rerender({ playing: false });
    expect(element.style.getPropertyValue('--break-t')).toBe('180');
    expect(nextFrame).toBeNull();
    rerender({ playing: true });
    frame(96);
    expect(element.style.getPropertyValue('--break-t')).toBe('180');
  });

  it('caps the fallback when media and fresh time samples are unavailable', () => {
    const element = document.createElement('div');
    const start = performance.now();
    renderHook(() => usePlaybackAnimationClock({ current: element }, { elapsedMs: 100, playedMs: 3_000 }, true));
    for (let elapsed = 16; elapsed <= 2_000; elapsed += 16) frame(start + elapsed);
    expect(Number(element.style.getPropertyValue('--break-t'))).toBe(600);
  });

  it('corrects drift equally over the same time on 60 Hz and 120 Hz displays', () => {
    const sixty = advanceBreakClock(1_000, 1_100, 1_000 / 60, 3_000);
    const half = advanceBreakClock(1_000, 1_100, 1_000 / 120, 3_000);
    const oneTwenty = advanceBreakClock(half, 1_100 + 1_000 / 120, 1_000 / 120, 3_000);
    expect(oneTwenty).toBeCloseTo(sixty, 6);
  });
});

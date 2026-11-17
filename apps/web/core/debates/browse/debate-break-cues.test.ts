import { renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useBreakCuts } from './debate-break-cues';
import { BREAK_CLOCK_SNAP_MS, advanceBreakClock } from './use-playback-animation-clock';

// A 60 fps frame, inside a 2.85 s break.
const FRAME = 16;
const PLAYED = 2_850;

describe('advanceBreakClock', () => {
  it('runs at real speed when the playhead agrees with it', () => {
    expect(advanceBreakClock(1_000, 1_000, FRAME, PLAYED)).toBe(1_016);
  });

  // The roughness on some runs: a playhead sample landing behind the drawn clock used to pull it
  // back, so the banner's wipe stepped backwards mid-roll.
  it('never steps backwards for a sample that lands a little behind it', () => {
    for (const behind of [10, 50, 150, BREAK_CLOCK_SNAP_MS]) {
      expect(advanceBreakClock(1_000, 1_000 - behind, FRAME, PLAYED)).toBeGreaterThanOrEqual(1_000);
    }
  });

  it('takes drift in a little at a time, catching up or easing off', () => {
    const behindTarget = advanceBreakClock(1_000, 1_100, FRAME, PLAYED);
    const aheadOfTarget = advanceBreakClock(1_000, 900, FRAME, PLAYED);
    expect(behindTarget).toBeGreaterThan(1_016);
    expect(behindTarget).toBeLessThan(1_100);
    expect(aheadOfTarget).toBeLessThan(1_016);
  });

  it('jumps for a gap too wide to be drift, as a scrub makes', () => {
    expect(advanceBreakClock(500, 2_000, FRAME, PLAYED)).toBe(2_000);
    expect(advanceBreakClock(2_000, 500, FRAME, PLAYED)).toBe(500);
  });

  it('stops at the end of the played stretch', () => {
    expect(advanceBreakClock(PLAYED - 5, PLAYED + 100, FRAME, PLAYED)).toBe(PLAYED);
  });
});

// GEO-3773: the cut is in recording ms, the timer waits wall ms, so at 2x it fires in half the time.
describe('useBreakCuts at a playback rate', () => {
  const cuts = [{ atMs: 10_000, toMs: 12_000 }];

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    [1, 750],
    [1.5, 500],
    [2, 375],
  ])('at %sx fires a cut 750 ms of recording ahead after %s ms of wall time', (rate, wallMs) => {
    const seek = vi.fn();
    renderHook(() => useBreakCuts(cuts, { playheadMs: 9_250, running: true, seek, rate }));

    vi.advanceTimersByTime(wallMs - 1);
    expect(seek).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(seek).toHaveBeenCalledWith(12);
  });

  it('waits for a lagging recording in wall time at the rate, too', () => {
    const seek = vi.fn();
    let live = 9_400;
    renderHook(() => useBreakCuts(cuts, { playheadMs: 9_250, running: true, seek, positionMs: () => live, rate: 2 }));

    // The first timer finds the recording 600 ms of media short of the cut: 300 ms of wall at 2x.
    vi.advanceTimersByTime(375);
    expect(seek).not.toHaveBeenCalled();
    live = 10_000;
    vi.advanceTimersByTime(299);
    expect(seek).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(seek).toHaveBeenCalledWith(12);
  });

  it('times the cut at 1x when no rate is given', () => {
    const seek = vi.fn();
    renderHook(() => useBreakCuts(cuts, { playheadMs: 9_250, running: true, seek }));

    vi.advanceTimersByTime(749);
    expect(seek).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(seek).toHaveBeenCalledOnce();
  });
});

import { describe, expect, it } from 'vitest';

import { BREAK_CLOCK_SNAP_MS, advanceBreakClock } from './debate-break-cues';

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

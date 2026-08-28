import { describe, expect, it } from 'vitest';

import {
  CALL_END_TIMER_DELAY_MINUTES,
  LIVE_MEETING_GRACE_MINUTES,
  LIVE_WINDOW_AFTER_MS,
  LIVE_WINDOW_BEFORE_MS,
  isOccurrenceLive,
} from './constants';

const START = Date.UTC(2026, 2, 5, 17, 0);
const END = Date.UTC(2026, 2, 5, 18, 0);
const MINUTE = 60 * 1000;

/** The instant every connected client force-disconnects itself — see CallEndTimer. */
const hardCutoff = END + LIVE_MEETING_GRACE_MINUTES * MINUTE;
/** The instant the countdown banner appears. */
const countdownStart = END + CALL_END_TIMER_DELAY_MINUTES * MINUTE;

describe('join window vs. the forced cutoff', () => {
  /**
   * GEO-2584. These two used to be written as independent literals that happened to be
   * equal, so the join screen admitted people at the very instant the cutoff ejected them,
   * and rejoining was permitted so it looped. Anyone admitted must get the full countdown.
   */
  it('stops admitting joiners before the hard cutoff', () => {
    expect(END + LIVE_WINDOW_AFTER_MS).toBeLessThan(hardCutoff);
  });

  it('stops admitting joiners no later than the countdown banner', () => {
    expect(END + LIVE_WINDOW_AFTER_MS).toBeLessThanOrEqual(countdownStart);
  });

  it('refuses to join once the countdown is under way', () => {
    expect(isOccurrenceLive(START, END, countdownStart + 1)).toBe(false);
    expect(isOccurrenceLive(START, END, hardCutoff - MINUTE)).toBe(false);
    expect(isOccurrenceLive(START, END, hardCutoff)).toBe(false);
    expect(isOccurrenceLive(START, END, hardCutoff + MINUTE)).toBe(false);
  });

  /**
   * The property that actually protects the user, stated directly: whatever the last
   * admissible instant is, the cutoff must still be a full countdown away from it. The old
   * window failed this with a margin of zero — the last joiner had no time at all.
   */
  it('leaves an admitted joiner the whole countdown before the cutoff', () => {
    const lastAdmissibleInstant = END + LIVE_WINDOW_AFTER_MS;
    const countdownLengthMs = (LIVE_MEETING_GRACE_MINUTES - CALL_END_TIMER_DELAY_MINUTES) * MINUTE;
    expect(hardCutoff - lastAdmissibleInstant).toBeGreaterThanOrEqual(countdownLengthMs);
  });

  it('still admits joiners through the grace window up to that point', () => {
    expect(isOccurrenceLive(START, END, END + LIVE_WINDOW_AFTER_MS)).toBe(true);
    expect(isOccurrenceLive(START, END, END + LIVE_WINDOW_AFTER_MS - 1)).toBe(true);
    expect(isOccurrenceLive(START, END, END + MINUTE)).toBe(true);
  });
});

describe('isOccurrenceLive', () => {
  it('admits early joiners within the pre-start window and refuses them before it', () => {
    expect(isOccurrenceLive(START, END, START - LIVE_WINDOW_BEFORE_MS)).toBe(true);
    expect(isOccurrenceLive(START, END, START - LIVE_WINDOW_BEFORE_MS - 1)).toBe(false);
  });

  it('is live throughout the scheduled window', () => {
    expect(isOccurrenceLive(START, END, START)).toBe(true);
    expect(isOccurrenceLive(START, END, (START + END) / 2)).toBe(true);
    expect(isOccurrenceLive(START, END, END)).toBe(true);
  });
});

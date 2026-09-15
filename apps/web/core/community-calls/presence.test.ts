import { describe, expect, it } from 'vitest';

import { LIVE_MEETING_GRACE_MINUTES } from './constants';
import { applyPresence, formatPresence, shouldAskPresence } from './presence';

const start = Date.parse('2026-05-21T09:00:00Z');
const end = Date.parse('2026-05-21T11:00:00Z');
const timing = { startMs: start, endMs: end };
const graceMs = LIVE_MEETING_GRACE_MINUTES * 60 * 1000;

describe('shouldAskPresence', () => {
  it('asks inside the window', () => {
    expect(shouldAskPresence(timing, start)).toBe(true);
    expect(shouldAskPresence(timing, end)).toBe(true);
  });

  it('keeps asking through the grace period, so a call that runs long still reads as live', () => {
    expect(shouldAskPresence(timing, end + graceMs - 1)).toBe(true);
    expect(shouldAskPresence(timing, end + graceMs + 1)).toBe(false);
  });

  // The page would otherwise sit on a polling timer forever on a call from months ago.
  it('does not ask before the start or long after the end', () => {
    expect(shouldAskPresence(timing, start - 1)).toBe(false);
    expect(shouldAskPresence(timing, end + 24 * 60 * 60 * 1000)).toBe(false);
  });

  it('gives an event with no end the same grace off its start', () => {
    const open = { startMs: start, endMs: null };
    expect(shouldAskPresence(open, start + graceMs - 1)).toBe(true);
    expect(shouldAskPresence(open, start + graceMs + 1)).toBe(false);
  });

  it('never asks about an undated event', () => {
    expect(shouldAskPresence(null, start)).toBe(false);
  });
});

describe('applyPresence', () => {
  const nobody = { names: [], isEnded: false };
  const someone = { names: ['Bri'], isEnded: false };
  const over = { names: [], isEnded: true };

  it('closes a call the clock still thinks is open', () => {
    expect(applyPresence('live', over)).toBe('past');
  });

  it('holds a call open past its scheduled end while people are in the room', () => {
    expect(applyPresence('past', someone)).toBe('live');
  });

  it('does not open a call early — before the start the clock is the only authority', () => {
    expect(applyPresence('upcoming', someone)).toBe('upcoming');
  });

  it('leaves the clock alone when the room is merely empty', () => {
    expect(applyPresence('live', nobody)).toBe('live');
    expect(applyPresence('past', nobody)).toBe('past');
  });

  // Not yet answered, or never going to: either way the clock's answer stands rather than the
  // join button disappearing.
  it('falls back to the clock when presence is unknown', () => {
    expect(applyPresence('live', null)).toBe('live');
    expect(applyPresence('past', null)).toBe('past');
    expect(applyPresence('undated', null)).toBe('undated');
  });
});

describe('formatPresence', () => {
  it('names one and two people outright', () => {
    expect(formatPresence(['Bri'])).toBe('Bri is here');
    expect(formatPresence(['Bri', 'Sam'])).toBe('Bri and Sam are here');
  });

  it('collapses the tail past two names', () => {
    expect(formatPresence(['Bri', 'Sam', 'Alex'])).toBe('Bri, Sam and 1 other are here');
    expect(formatPresence(['Bri', 'Sam', 'Alex', 'Jo', 'Kit'])).toBe('Bri, Sam and 3 others are here');
  });

  it('ignores blank names rather than counting them', () => {
    expect(formatPresence(['Bri', '   ', ''])).toBe('Bri is here');
  });

  it('is null for an empty room, so the caller can say nothing at all', () => {
    expect(formatPresence([])).toBeNull();
    expect(formatPresence(['', '  '])).toBeNull();
  });
});

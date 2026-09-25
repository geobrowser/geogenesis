import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getRelativeTime } from './comment-time';

const NOW = new Date('2026-09-25T12:00:00.000Z');

function ago(ms: number): string {
  return getRelativeTime(new Date(NOW.getTime() - ms).toISOString());
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Every row in the claim's activity feed ages through here — debates, extracted claims and comments
 * alike — so a plural that does not agree with its number shows up on all three.
 */
describe('getRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('agrees with its number on the singular, the way the hours already did', () => {
    expect(ago(MINUTE)).toBe('1 min');
    expect(ago(2 * MINUTE)).toBe('2 mins');
    expect(ago(HOUR)).toBe('1 hour');
    expect(ago(2 * HOUR)).toBe('2 hours');
  });

  it('is coarse on purpose: the nearest unit, not a duration', () => {
    expect(ago(30 * SECOND)).toBe('just now');
    expect(ago(59 * MINUTE + 59 * SECOND)).toBe('59 mins');
    expect(ago(23 * HOUR)).toBe('23 hours');
    expect(ago(3 * DAY)).toBe('3d ago');
    expect(ago(2 * 7 * DAY)).toBe('2w ago');
  });

  it('prints a date once a row is older than a month, rather than counting weeks forever', () => {
    expect(ago(40 * DAY)).toMatch(/\d/);
    expect(ago(40 * DAY)).not.toContain('w ago');
  });

  // A row whose timestamp the graph never recorded. The feed sorts these last; the age has nothing
  // to say about them, and an empty string is what the row renders as no age at all.
  it('says nothing about an unparseable date', () => {
    expect(getRelativeTime('')).toBe('');
    expect(getRelativeTime('not a date')).toBe('');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

import { markDailyUploadComplete, msUntilNextLocalMidnight, readDailyUploadComplete } from './daily-activities-storage';

describe('daily-activities-storage', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.useRealTimers();
  });

  it('marks upload complete for the local calendar day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T15:30:00'));

    expect(readDailyUploadComplete('space-1')).toBe(false);
    markDailyUploadComplete('space-1');
    expect(readDailyUploadComplete('space-1')).toBe(true);
    expect(readDailyUploadComplete('space-2')).toBe(false);
  });

  it('resets after local midnight', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T23:59:00'));
    markDailyUploadComplete('space-1');
    expect(readDailyUploadComplete('space-1')).toBe(true);

    vi.setSystemTime(new Date('2026-07-22T00:00:01'));
    expect(readDailyUploadComplete('space-1')).toBe(false);
  });

  it('computes ms until next local midnight', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T23:00:00'));
    expect(msUntilNextLocalMidnight()).toBe(60 * 60 * 1000);
  });
});

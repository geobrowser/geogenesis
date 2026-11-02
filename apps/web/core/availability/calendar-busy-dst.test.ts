import { describe, expect, it } from 'vitest';

// Pinned, so these mean the same on any machine: a UTC runner has no clock changes to test.
process.env.TZ = 'America/New_York';

const { calendarBusyWindow } = await import('./calendar-busy');

const HOUR_MS = 60 * 60 * 1000;

describe('calendarBusyWindow across a clock change', () => {
  it('ends at local midnight after clocks fall back, an hour past 90 × 24h', () => {
    // Monday 2026-10-05 to 2027-01-03, across the 2026-11-01 change.
    const { from, to } = calendarBusyWindow(new Date(2026, 9, 8, 15));
    const end = new Date(to);

    expect([end.getFullYear(), end.getMonth(), end.getDate(), end.getHours(), end.getMinutes()]).toEqual([
      2027, 0, 3, 0, 0,
    ]);
    expect(Date.parse(to) - Date.parse(from)).toBe(90 * 24 * HOUR_MS + HOUR_MS);
  });

  it('ends at local midnight after clocks spring forward, inside geo-chat’s 92-day cap', () => {
    // Monday 2027-02-01 to 2027-05-02, across the 2027-03-14 change.
    const { from, to } = calendarBusyWindow(new Date(2027, 1, 3, 9));
    const end = new Date(to);

    expect([end.getMonth(), end.getDate(), end.getHours()]).toEqual([4, 2, 0]);
    expect(Date.parse(to) - Date.parse(from)).toBe(90 * 24 * HOUR_MS - HOUR_MS);
    expect(Date.parse(to) - Date.parse(from)).toBeLessThan(92 * 24 * HOUR_MS);
  });
});

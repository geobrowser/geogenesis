import { describe, expect, it } from 'vitest';

import type { AvailabilityBlock } from './blocks';
import { summarizeSchedule } from './schedule-summary';

let nextId = 0;
const weekly = (weekday: number, start: string, end: string): AvailabilityBlock => ({
  id: `r${nextId++}`,
  kind: 'recurring',
  weekday,
  start: minutes(start),
  end: minutes(end),
});
const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

describe('summarizeSchedule', () => {
  it('is null for an empty week', () => {
    expect(summarizeSchedule([])).toBeNull();
  });

  it('collapses a working week with the same hours into one range', () => {
    const blocks = [0, 1, 2, 3, 4].map(day => weekly(day, '18:00', '20:00'));
    expect(summarizeSchedule(blocks)).toBe('Mon–Fri 6 – 8pm');
  });

  it('keeps the suffix on both ends when a window crosses noon', () => {
    expect(summarizeSchedule([weekly(5, '10:00', '12:00')])).toBe('Sat 10am – 12pm');
  });

  it('lists short runs day by day and separates distinct hours', () => {
    const blocks = [
      weekly(0, '18:00', '20:00'),
      weekly(2, '18:00', '20:00'),
      weekly(5, '10:00', '12:00'),
      weekly(6, '10:00', '12:00'),
    ];
    expect(summarizeSchedule(blocks)).toBe('Mon, Wed 6 – 8pm · Sat, Sun 10am – 12pm');
  });

  it('says every day when all seven match', () => {
    const blocks = [0, 1, 2, 3, 4, 5, 6].map(day => weekly(day, '09:00', '09:30'));
    expect(summarizeSchedule(blocks)).toBe('Every day 9 – 9:30am');
  });

  it('merges touching blocks and lists several windows in a day', () => {
    const blocks = [weekly(1, '09:00', '10:00'), weekly(1, '10:00', '11:00'), weekly(1, '19:00', '21:00')];
    expect(summarizeSchedule(blocks)).toBe('Tue 9 – 11am, 7 – 9pm');
  });

  it('writes a window that runs to midnight as ending at 12am', () => {
    expect(summarizeSchedule([weekly(4, '22:00', '24:00')])).toBe('Fri 10pm – 12am');
  });

  // Past three groups a line stops being scannable.
  it('falls back to a count when the week has too many patterns', () => {
    const blocks = [
      weekly(0, '09:00', '10:00'),
      weekly(1, '10:00', '11:00'),
      weekly(2, '11:00', '12:00'),
      weekly(3, '12:00', '13:00'),
    ];
    expect(summarizeSchedule(blocks)).toBe('Free 4 days a week');
  });

  // A one-off date is not a weekly pattern, and summarising it alongside one would read as though
  // it repeats.
  it('ignores one-off dates beside a weekly pattern, and says so when there is nothing else', () => {
    const dated: AvailabilityBlock = { id: 'd', kind: 'dated', date: '2026-10-01', start: 600, end: 660 };
    expect(summarizeSchedule([weekly(0, '18:00', '20:00'), dated])).toBe('Mon 6 – 8pm');
    expect(summarizeSchedule([dated])).toBe('Free on specific dates');
  });
});

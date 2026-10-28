import { describe, expect, it } from 'vitest';

import { CALENDAR_BUSY_WINDOW_DAYS, busySegmentsForDate, calendarBusyWindow } from './calendar-busy';

// Built from local wall-clock times so the cases hold in whatever zone the suite runs in.
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString();
const monday = new Date(2026, 9, 5);

describe('busySegmentsForDate', () => {
  it('places an interval inside the day in minutes from midnight', () => {
    expect(busySegmentsForDate([{ start: at(5, 9, 30), end: at(5, 11) }], monday)).toEqual([
      { start: 9 * 60 + 30, end: 11 * 60 },
    ]);
  });

  it('clips an interval running across midnight to each day it touches', () => {
    const overnight = [{ start: at(5, 22), end: at(6, 2) }];
    expect(busySegmentsForDate(overnight, monday)).toEqual([{ start: 22 * 60, end: 24 * 60 }]);
    expect(busySegmentsForDate(overnight, new Date(2026, 9, 6))).toEqual([{ start: 0, end: 2 * 60 }]);
  });

  it('skips other days and unreadable instants, and sorts the rest', () => {
    expect(
      busySegmentsForDate(
        [
          { start: at(5, 14), end: at(5, 15) },
          { start: at(4, 9), end: at(4, 10) },
          { start: 'not a time', end: at(5, 10) },
          { start: at(5, 8), end: at(5, 9) },
        ],
        monday
      )
    ).toEqual([
      { start: 8 * 60, end: 9 * 60 },
      { start: 14 * 60, end: 15 * 60 },
    ]);
  });
});

describe('calendarBusyWindow', () => {
  it('starts at this week’s Monday and spans the busy window', () => {
    const { from, to } = calendarBusyWindow(new Date(2026, 9, 8, 15, 0));
    expect(from).toBe(new Date(2026, 9, 5).toISOString());
    expect(to).toBe(new Date(2026, 9, 5 + CALENDAR_BUSY_WINDOW_DAYS).toISOString());
  });

  it('treats Sunday as the end of the week, not the start', () => {
    expect(calendarBusyWindow(new Date(2026, 9, 11, 12)).from).toBe(new Date(2026, 9, 5).toISOString());
  });
});

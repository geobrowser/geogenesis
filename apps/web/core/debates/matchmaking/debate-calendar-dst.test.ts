import { describe, expect, it } from 'vitest';

import type { AvailabilityBlock } from '~/core/availability/blocks';
import type { SchedulablePeopleResponse } from '~/core/debates/api';

// Pinned, so these mean the same on any machine: a UTC runner has no clock changes to test.
process.env.TZ = 'America/Los_Angeles';

const { freeSlotsByUser, viewerFreeCellKeys, viewerFreeSlots, weekDays, weekOffsetLabels, weekStart } =
  await import('./debate-calendar-model');

const local = (year: number, month: number, day: number, hour: number, minute = 0) =>
  new Date(year, month - 1, day, hour, minute).getTime();

function response(start: number, end: number): SchedulablePeopleResponse {
  return {
    viewer_timezone: 'America/Los_Angeles',
    viewer_has_schedule: false,
    truncated: false,
    people: [
      {
        user: { user_id: 'a', profile_space_id: 'space-a', display_name: 'A', avatar_cid: null },
        online: false,
        slots: [],
        truncated: false,
        their_windows: [{ start: new Date(start).toISOString(), end: new Date(end).toISOString(), viewer_free: false }],
      },
    ],
  };
}

describe('the calendar across clock changes', () => {
  // Clocks go back at 02:00 on Sun 1 Nov 2026, so this local fortnight is an hour longer than 14 days.
  it('keeps the last half-hour of a fortnight that gains an hour', () => {
    const from = local(2026, 10, 26, 0, 30);
    const to = local(2026, 11, 9, 0, 0);
    const slots = freeSlotsByUser(response(from, to), from - 1).get('a') ?? [];

    expect(slots.at(-1)?.start).toBe(local(2026, 11, 8, 23, 30));
  });

  // Clocks go forward at 02:00 on Sun 14 Mar 2027: that day has no 2am hour to shade. It opens the
  // grid's second week, while the saved schedule calls it the seventh day of the first.
  it('shades the hour a free half-hour is in, not an hour the clocks skipped', () => {
    const now = new Date(2027, 2, 10, 10, 0);
    const blocks: AvailabilityBlock[] = [{ id: 'r', kind: 'recurring', weekday: 6, start: 3 * 60, end: 3 * 60 + 30 }];
    const keys = viewerFreeCellKeys(viewerFreeSlots(blocks, 'America/Los_Angeles', now), weekDays(weekStart(now, 1)));

    expect(keys.has('0:3')).toBe(true);
    expect(keys.has('0:2')).toBe(false);
  });

  it("heads the time column with the zone's offset", () => {
    expect(weekOffsetLabels(weekDays(weekStart(new Date(local(2026, 10, 7, 10)), 0)))).toEqual(['GMT-07']);
    // US clocks change on a Sunday, the first day of a week, so even that week carries one offset.
    expect(weekOffsetLabels(weekDays(weekStart(new Date(local(2026, 11, 4, 10)), 0)))).toEqual(['GMT-08']);
  });

  // Israel's clocks go forward on a Friday (27 Mar 2026), inside a Sunday-first week.
  it('names both offsets in a week the clocks change mid-week', () => {
    process.env.TZ = 'Asia/Jerusalem';
    try {
      expect(weekOffsetLabels(weekDays(weekStart(new Date(2026, 2, 25, 10), 0)))).toEqual(['GMT+02', 'GMT+03']);
    } finally {
      process.env.TZ = 'America/Los_Angeles';
    }
  });
});

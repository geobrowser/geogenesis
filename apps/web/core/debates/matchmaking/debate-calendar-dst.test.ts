import { describe, expect, it } from 'vitest';

import type { AvailabilityBlock } from '~/core/availability/blocks';
import type { SchedulablePeopleResponse } from '~/core/debates/api';

// Pinned, so these mean the same on any machine: a UTC runner has no clock changes to test.
process.env.TZ = 'America/Los_Angeles';

const { freeSlotsByUser, viewerFreeCellKeys, viewerFreeSlots, weekDays, weekStart } =
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

  // Clocks go forward at 02:00 on Sun 14 Mar 2027: that day has no 2am hour to shade.
  it('shades the hour a free half-hour is in, not an hour the clocks skipped', () => {
    const now = new Date(2027, 2, 10, 10, 0);
    const blocks: AvailabilityBlock[] = [{ id: 'r', kind: 'recurring', weekday: 6, start: 3 * 60, end: 3 * 60 + 30 }];
    const keys = viewerFreeCellKeys(viewerFreeSlots(blocks, 'America/Los_Angeles', now), weekDays(weekStart(now, 0)));

    expect(keys.has('6:3')).toBe(true);
    expect(keys.has('6:2')).toBe(false);
  });
});

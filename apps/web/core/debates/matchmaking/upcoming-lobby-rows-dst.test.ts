import { describe, expect, it } from 'vitest';

import type { DebateLobbyCalendarRow } from '~/core/debates/api';

// Pinned, so these mean the same on any machine: a UTC runner has no clock changes to test.
process.env.TZ = 'America/New_York';

const { unansweredLobbies, unansweredLobbyRange } = await import('./upcoming-lobby-rows');

const HOUR_MS = 3_600_000;

const lobby = (id: string, startsAt: Date): DebateLobbyCalendarRow => ({
  lobby_id: id,
  name: id,
  scheduled: true,
  starts_at: startsAt.toISOString(),
  opens_at: startsAt.toISOString(),
  open: false,
  hosts: [],
  headcount: 0,
  avatars: [],
  debating_count: 0,
  reminder_count: 0,
  viewer_reminded: false,
  viewer_dismissed: false,
  viewer_on_roster: false,
  state: 'upcoming',
  closed_at: null,
});

// GEO-3519. Clocks go back at 02:00 on Sun 1 Nov 2026, inside the week from Wed 28 Oct, so that
// week is an hour longer than seven days of 24 hours.
describe('the Requests timeline’s lobby week across the clocks going back', () => {
  const now = new Date(2026, 9, 28, 12, 0).getTime();

  it('still ends at local midnight a week on', () => {
    const { from, to } = unansweredLobbyRange(now);

    expect(from).toEqual(new Date(2026, 9, 28));
    expect(to).toEqual(new Date(2026, 10, 4));
    expect(to.getHours()).toBe(0);
    expect(to.getTime() - from.getTime()).toBe((7 * 24 + 1) * HOUR_MS);
  });

  it('offers the last evening of the week and not the first hour after it', () => {
    const lastEvening = lobby('last-evening', new Date(2026, 10, 3, 23, 30));
    const weekOn = lobby('week-on', new Date(2026, 10, 4, 0, 30));

    expect(unansweredLobbies([lastEvening, weekOn], [], 'user-me', now).map(row => row.lobby_id)).toEqual([
      'last-evening',
    ]);
  });
});

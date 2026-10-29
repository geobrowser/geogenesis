import { describe, expect, it } from 'vitest';

import type { DebateLobbyCalendarRow, DebateLobbySummary } from '../api';
import { DEBATE_HOURS_WINDOW_MS, debateHours, debateHoursLobbies, debateHoursRange } from './debate-hours';

const NOW = Date.parse('2026-10-28T12:00:00Z');
const HOUR = 60 * 60_000;

// A lobby opens ten minutes before it starts, so a fixture that moves `starts_at` moves `opens_at` with it.
const lobby = (id: string, overrides: Partial<DebateLobbySummary> = {}): DebateLobbySummary => ({
  lobby_id: id,
  name: id,
  scheduled: true,
  starts_at: new Date(NOW + 5 * HOUR).toISOString(),
  opens_at: new Date(
    Date.parse(overrides.starts_at ?? new Date(NOW + 5 * HOUR).toISOString()) - 10 * 60_000
  ).toISOString(),
  open: false,
  hosts: [],
  headcount: 0,
  avatars: [],
  debating_count: 0,
  reminder_count: 0,
  viewer_reminded: false,
  viewer_on_roster: false,
  ...overrides,
});

const at = (msFromNow: number) => new Date(NOW + msFromNow).toISOString();

// GEO-3517.
describe('debateHours', () => {
  it('features the next debate hour and lists the rest soonest first', () => {
    const hours = debateHours(
      [
        lobby('thu', { starts_at: at(48 * HOUR) }),
        lobby('today', { starts_at: at(3 * HOUR) }),
        lobby('wed', { starts_at: at(24 * HOUR) }),
      ],
      NOW
    );
    expect(hours.featured?.lobby_id).toBe('today');
    expect(hours.rest.map(row => row.lobby_id)).toEqual(['wed', 'thu']);
  });

  it('features a lobby that is open now over one still to start, the busiest when several are', () => {
    const hours = debateHours(
      [
        lobby('soon', { starts_at: at(HOUR) }),
        lobby('quiet', { open: true, headcount: 3 }),
        lobby('busy', { open: true, headcount: 12 }),
      ],
      NOW
    );
    expect(hours.featured?.lobby_id).toBe('busy');
    expect(hours.rest.map(row => row.lobby_id)).toEqual(['quiet', 'soon']);
  });

  it('leaves out lobbies starting after this week', () => {
    const hours = debateHours(
      [
        lobby('in', { starts_at: at(DEBATE_HOURS_WINDOW_MS - HOUR) }),
        lobby('out', { starts_at: at(DEBATE_HOURS_WINDOW_MS + HOUR) }),
      ],
      NOW
    );
    expect(hours.featured?.lobby_id).toBe('in');
    expect(hours.rest).toEqual([]);
  });

  it('keeps a lobby whose start just passed but that has not opened yet', () => {
    const hours = debateHours([lobby('late', { starts_at: at(-2 * 60_000) })], NOW);
    expect(hours.featured?.lobby_id).toBe('late');
  });

  it('adds up who is going across the lobbies still to open', () => {
    const hours = debateHours(
      [
        lobby('a', { reminder_count: 6 }),
        lobby('b', { reminder_count: 4, starts_at: at(30 * HOUR) }),
        lobby('live', { open: true, reminder_count: 9 }),
      ],
      NOW
    );
    expect(hours.goingTotal).toBe(10);
  });

  it('has nothing to feature with no lobbies', () => {
    expect(debateHours([], NOW)).toEqual({ featured: null, rest: [], goingTotal: 0 });
  });
});

const calendarRow = (
  id: string,
  state: DebateLobbyCalendarRow['state'] = 'upcoming',
  overrides: Partial<DebateLobbySummary> = {}
): DebateLobbyCalendarRow => ({ ...lobby(id, overrides), state, closed_at: null });

// GEO-3517: the list shows two lobbies per host, so a host's third this week comes from the calendar.
describe('debateHoursLobbies', () => {
  it('adds the calendar lobbies still to open that the list leaves out', () => {
    const merged = debateHoursLobbies(
      [lobby('first'), lobby('second')],
      [calendarRow('first'), calendarRow('second'), calendarRow('third')]
    );
    expect(merged.map(row => row.lobby_id)).toEqual(['first', 'second', 'third']);
  });

  it('keeps the list row for a lobby on both, matched however its id is written', () => {
    const listed = lobby('0123456789abcdef0123456789abcdef', { viewer_reminded: true });
    const merged = debateHoursLobbies(
      [listed],
      [calendarRow('01234567-89ab-cdef-0123-456789abcdef', 'upcoming', { viewer_reminded: false })]
    );
    expect(merged).toEqual([listed]);
  });

  it('leaves rooms open now and ended ones to the list', () => {
    const merged = debateHoursLobbies([], [calendarRow('open', 'open', { open: true }), calendarRow('ended', 'ended')]);
    expect(merged).toEqual([]);
  });

  it('is the list alone without a calendar', () => {
    const list = [lobby('only')];
    expect(debateHoursLobbies(list, undefined)).toBe(list);
  });
});

describe('debateHoursRange', () => {
  it('runs from the top of the hour past the week, and holds through the hour', () => {
    const { from, to } = debateHoursRange(NOW + 25 * 60_000);
    expect(from.toISOString()).toBe('2026-10-28T12:00:00.000Z');
    expect(to.getTime()).toBeGreaterThanOrEqual(NOW + 25 * 60_000 + DEBATE_HOURS_WINDOW_MS);
    expect(debateHoursRange(NOW + 59 * 60_000)).toEqual({ from, to });
    expect(debateHoursRange(NOW + HOUR).from.getTime()).toBe(NOW + HOUR);
  });
});

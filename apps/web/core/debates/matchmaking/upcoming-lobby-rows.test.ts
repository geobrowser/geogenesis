import { describe, expect, it } from 'vitest';

import type { DebateLobbyCalendarRow, DebateLobbySummary, UpcomingDebateRoom } from '~/core/debates/api';

import {
  UNANSWERED_LOBBY_DAYS,
  lobbySubLine,
  unansweredLobbies,
  unansweredLobbyRange,
  upcomingLobbyRows,
} from './upcoming-lobby-rows';

const HOST = { user_id: 'user-host', profile_space_id: 'space-host', display_name: 'Bryan', avatar_cid: null };

const lobbyRoom = (overrides: Partial<UpcomingDebateRoom> = {}): UpcomingDebateRoom => ({
  room_id: '0a1b2c3d-0000-4000-8000-000000000001',
  starts_at: '2099-09-24T14:00:00Z',
  opens_at: '2099-09-24T13:50:00Z',
  joinable: false,
  due: false,
  others_present: false,
  kind: 'lobby',
  name: 'Should cities ban cars?',
  ...overrides,
});

const summary = (overrides: Partial<DebateLobbySummary> = {}): DebateLobbySummary => ({
  // The list spells the same lobby without dashes.
  lobby_id: '0a1b2c3d000040008000000000000001',
  name: 'Should cities ban cars?',
  scheduled: true,
  starts_at: '2099-09-24T14:00:00Z',
  opens_at: '2099-09-24T13:50:00Z',
  open: false,
  hosts: [HOST],
  headcount: 0,
  avatars: [],
  debating_count: 0,
  reminder_count: 1,
  viewer_reminded: true,
  viewer_on_roster: false,
  ...overrides,
});

describe('upcomingLobbyRows', () => {
  it('lists a Going lobby, with its host from the lobby list across uuid spellings', () => {
    const rows = upcomingLobbyRows([lobbyRoom()], [summary()], 'user-me');

    expect(rows).toEqual([
      expect.objectContaining({ name: 'Should cities ban cars?', hosts: [HOST], hosting: false, open: false }),
    ]);
  });

  it('still lists a Going lobby the capped lobby list left out, without a host', () => {
    const rows = upcomingLobbyRows([lobbyRoom()], [], 'user-me');

    expect(rows).toEqual([expect.objectContaining({ name: 'Should cities ban cars?', hosts: [] })]);
  });

  it('takes the open door from the room, which is the read the join prompt uses', () => {
    const rows = upcomingLobbyRows([lobbyRoom({ joinable: true })], [summary({ open: false })], 'user-me');

    expect(rows[0]!.open).toBe(true);
  });

  it('ignores two-person rooms', () => {
    expect(upcomingLobbyRows([lobbyRoom({ kind: 'debate' }), lobbyRoom({ kind: undefined })], [], 'user-me')).toEqual(
      []
    );
  });

  it("lists the viewer's own scheduled lobby, which is never on their Going list", () => {
    const rows = upcomingLobbyRows([], [summary({ viewer_reminded: false })], 'user-host');

    expect(rows).toEqual([expect.objectContaining({ hosting: true, hosts: [HOST] })]);
  });

  it('lists a lobby the viewer hosts and said Going to once', () => {
    const rows = upcomingLobbyRows([lobbyRoom()], [summary()], 'user-host');

    expect(rows).toHaveLength(1);
    expect(rows[0]!.hosting).toBe(true);
  });

  it('leaves out lobbies the viewer neither hosts nor is going to', () => {
    expect(upcomingLobbyRows([], [summary({ viewer_reminded: false })], 'user-me')).toEqual([]);
  });

  it('leaves out a lobby the host opened on the spot', () => {
    expect(upcomingLobbyRows([], [summary({ scheduled: false, open: true })], 'user-host')).toEqual([]);
  });

  it('puts the soonest first across both sources', () => {
    const rows = upcomingLobbyRows(
      [lobbyRoom({ room_id: 'going-late', starts_at: '2099-09-24T16:00:00Z' })],
      [summary({ lobby_id: 'hosted-early', starts_at: '2099-09-24T12:00:00Z', viewer_reminded: false })],
      'user-host'
    );

    expect(rows.map(row => row.lobbyId)).toEqual(['hosted-early', 'going-late']);
  });

  it('lists no hosted lobbies before the viewer is known', () => {
    expect(upcomingLobbyRows([], [summary()], null)).toEqual([]);
  });

  // GEO-3519: an RSVP writes the week's row at once, and `/me/debate-rooms` hears of it a round trip
  // later. A lobby RSVP'd from the timeline is a Going row from the week meanwhile, not gone, and
  // whatever the capped list holds.
  describe('from the calendar’s week', () => {
    const inWeek = (overrides: Partial<DebateLobbyCalendarRow> = {}): DebateLobbyCalendarRow => ({
      ...summary(overrides),
      state: 'upcoming',
      closed_at: null,
      ...overrides,
    });

    it('lists a lobby the week says the viewer is going to, one the list left out included', () => {
      const week = [inWeek({ viewer_reminded: true })];
      const rows = upcomingLobbyRows([], [], 'user-me', week);

      expect(rows).toEqual([
        expect.objectContaining({ name: 'Should cities ban cars?', hosting: false, hosts: [HOST], summary: week[0] }),
      ]);
    });

    it('draws it once when the rooms read has it too, with the room’s open door', () => {
      const rows = upcomingLobbyRows([lobbyRoom({ joinable: true })], [], 'user-me', [inWeek()]);

      expect(rows).toEqual([expect.objectContaining({ open: true, hosts: [HOST] })]);
    });

    it('leaves out lobbies in it the viewer is not going to', () => {
      expect(upcomingLobbyRows([], [], 'user-me', [inWeek({ viewer_reminded: false })])).toEqual([]);
    });

    // Once open, the rooms read is what says the viewer is still going: geo-chat drops the entry once
    // they join.
    it('leaves an open lobby the viewer RSVP’d to to the rooms read', () => {
      expect(upcomingLobbyRows([], [], 'user-me', [inWeek({ open: true, state: 'open' })])).toEqual([]);
    });
  });

  // The list's Going rows are the week's to draw: where the timeline offers RSVP, it reads the week.
  it('leaves a lobby the list alone says the viewer is going to for the rooms read', () => {
    expect(upcomingLobbyRows([], [summary({ viewer_reminded: true })], 'user-me')).toEqual([]);
  });
});

// GEO-3519. One line for an offered lobby and one the viewer is going to, so the two cannot drift.
describe('lobbySubLine', () => {
  it('says who hosts it after "Lobby"', () => {
    expect(lobbySubLine({ hosting: false, hosts: [HOST] })).toBe('Lobby · Hosted by Bryan');
    expect(lobbySubLine({ hosting: true, hosts: [HOST] }, 'You’re going')).toBe('Lobby · You’re hosting');
  });

  it('falls back when the hosts are not known, or says "Lobby" alone', () => {
    expect(lobbySubLine({ hosting: false, hosts: [] }, 'You’re going')).toBe('Lobby · You’re going');
    expect(lobbySubLine({ hosting: false, hosts: [] })).toBe('Lobby');
  });
});

describe('unansweredLobbies', () => {
  // Local noon, so whole days either side stay on their calendar days.
  const NOW = new Date(2099, 8, 20, 12, 0).getTime();
  /** `days` local days from NOW, at `hour`. */
  const startsIn = (days: number, hour = 18) => new Date(2099, 8, 20 + days, hour, 0).toISOString();
  const upcoming = (id: string, overrides: Partial<DebateLobbyCalendarRow> = {}): DebateLobbyCalendarRow => ({
    ...summary({ lobby_id: id, viewer_reminded: false, starts_at: startsIn(1), opens_at: startsIn(1) }),
    state: 'upcoming',
    closed_at: null,
    ...overrides,
  });
  const ids = (lobbies: DebateLobbySummary[]) => lobbies.map(lobby => lobby.lobby_id);

  it('offers lobbies starting from today through the sixth day after, and none later or earlier', () => {
    const listed = [
      upcoming('today', { starts_at: startsIn(0, 23) }),
      upcoming('last-day', { starts_at: startsIn(UNANSWERED_LOBBY_DAYS - 1, 23) }),
      upcoming('a-week-on', { starts_at: startsIn(UNANSWERED_LOBBY_DAYS, 0) }),
      upcoming('yesterday', { starts_at: startsIn(-1) }),
    ];

    expect(ids(unansweredLobbies(listed, [], 'user-me', NOW))).toEqual(['today', 'last-day']);
  });

  it('leaves out lobbies the viewer RSVP’d to, hosts or dismissed, and open or ended ones', () => {
    const listed = [
      upcoming('offered'),
      upcoming('going', { viewer_reminded: true }),
      upcoming('hosting', { hosts: [HOST, { ...HOST, user_id: 'user-me' }] }),
      upcoming('dismissed', { viewer_dismissed: true }),
      upcoming('open', { open: true, state: 'open' }),
      upcoming('ended', { state: 'ended', closed_at: startsIn(0, 11) }),
    ];

    expect(ids(unansweredLobbies(listed, [], 'user-me', NOW))).toEqual(['offered']);
  });

  // An older geo-chat sends no `viewer_dismissed`: nothing is dismissed, rather than everything.
  it('reads a missing dismissal as not dismissed', () => {
    const { viewer_dismissed: _, ...older } = upcoming('older', { viewer_dismissed: false });

    expect(ids(unansweredLobbies([older], [], 'user-me', NOW))).toEqual(['older']);
  });

  it('never repeats a lobby the timeline already shows as going, across uuid spellings', () => {
    const going = [{ lobbyId: '0a1b2c3d-0000-4000-8000-000000000001' }];

    expect(unansweredLobbies([upcoming('0a1b2c3d000040008000000000000001')], going, 'user-me', NOW)).toEqual([]);
  });

  // Signed out there is no viewer, and Dismiss needs an account: no rows rather than a sign-in prompt.
  it('offers nothing before the viewer is known', () => {
    expect(unansweredLobbies([upcoming('offered')], [], null, NOW)).toEqual([]);
  });
});

describe('unansweredLobbyRange', () => {
  // The read's key is its bounds: midnights, so it moves once a day rather than every minute.
  it('runs from today’s local midnight to the midnight a week on, whatever the time', () => {
    const morning = unansweredLobbyRange(new Date(2099, 8, 20, 9, 15).getTime());
    const night = unansweredLobbyRange(new Date(2099, 8, 20, 23, 59).getTime());

    expect(morning.from).toEqual(new Date(2099, 8, 20));
    expect(morning.to).toEqual(new Date(2099, 8, 20 + UNANSWERED_LOBBY_DAYS));
    expect(night).toEqual(morning);
  });
});

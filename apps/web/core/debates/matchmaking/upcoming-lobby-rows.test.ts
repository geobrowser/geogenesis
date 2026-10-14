import { describe, expect, it } from 'vitest';

import type { DebateLobbySummary, UpcomingDebateRoom } from '~/core/debates/api';

import { upcomingLobbyRows } from './upcoming-lobby-rows';

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
    const rows = upcomingLobbyRows([lobbyRoom({ joinable: true, due: true })], [summary()], 'user-me');

    expect(rows[0]).toEqual(expect.objectContaining({ open: true, due: true }));
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
});

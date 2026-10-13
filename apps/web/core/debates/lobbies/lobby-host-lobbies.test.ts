import { describe, expect, it, vi } from 'vitest';

import type { DebateLobbySummary } from '../api';

vi.mock('./hooks', () => ({ useDebateLobbies: vi.fn(), useRefetchAtOpening: vi.fn() }));

const { listedHosts, nextLobbyByHost, soonestOpening } = await import('./lobby-host-lobbies');

const adam = { user_id: 'aaaa-1', profile_space_id: 's1', display_name: 'Adam', avatar_cid: null };
const priya = { user_id: 'bbbb-2', profile_space_id: 's2', display_name: 'Priya', avatar_cid: null };

const summary = (overrides: Partial<DebateLobbySummary>): DebateLobbySummary => ({
  lobby_id: 'lobby1',
  name: 'Lobby',
  scheduled: true,
  starts_at: '2026-10-20T18:00:00Z',
  opens_at: '2026-10-20T17:50:00Z',
  open: false,
  hosts: [adam],
  headcount: 0,
  avatars: [],
  debating_count: 0,
  reminder_count: 0,
  viewer_reminded: false,
  viewer_on_roster: false,
  ...overrides,
});

describe('listedHosts', () => {
  it('reads the hosts off the lobby’s list row, matching ids with or without dashes', () => {
    const lobbies = [summary({ lobby_id: 'ab-cd', hosts: [adam, priya] })];
    expect(listedHosts(lobbies, 'abcd')).toEqual([adam, priya]);
    expect(listedHosts(lobbies, 'other')).toEqual([]);
  });
});

describe('nextLobbyByHost', () => {
  const ended = 'ended';

  it('picks the soonest other lobby the host hosts', () => {
    const later = summary({ lobby_id: 'later', starts_at: '2026-10-22T18:00:00Z' });
    const sooner = summary({ lobby_id: 'sooner', starts_at: '2026-10-21T18:00:00Z' });
    const notTheirs = summary({ lobby_id: 'theirs', starts_at: '2026-10-13T18:00:00Z', hosts: [priya] });
    const next = nextLobbyByHost([later, notTheirs, sooner], 'aaaa1', ended);
    expect(next?.lobby.lobby_id).toBe('sooner');
    expect(next?.host).toBe(adam);
  });

  it('puts an open lobby first and never returns the lobby itself', () => {
    const open = summary({ lobby_id: 'open', open: true, starts_at: '2026-10-25T18:00:00Z' });
    const upcoming = summary({ lobby_id: 'upcoming' });
    const self = summary({ lobby_id: ended, open: true });
    expect(nextLobbyByHost([upcoming, self, open], adam.user_id, ended)?.lobby.lobby_id).toBe('open');
    expect(nextLobbyByHost([self], adam.user_id, ended)).toBeNull();
  });

  it('finds nothing without a creator', () => {
    expect(nextLobbyByHost([summary({})], null, ended)).toBeNull();
  });
});

describe('soonestOpening', () => {
  it('is the earliest opens_at among lobbies not open yet', () => {
    const lobbies = [
      summary({ lobby_id: 'a', open: true, opens_at: '2026-10-20T08:00:00Z' }),
      summary({ lobby_id: 'b', opens_at: '2026-10-21T17:50:00Z' }),
      summary({ lobby_id: 'c', opens_at: '2026-10-20T17:50:00Z' }),
    ];
    expect(soonestOpening(lobbies)).toBe('2026-10-20T17:50:00Z');
  });

  it('is null when every listed lobby is open', () => {
    expect(soonestOpening([summary({ open: true })])).toBeNull();
    expect(soonestOpening([])).toBeNull();
  });
});

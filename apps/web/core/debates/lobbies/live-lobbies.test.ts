import { describe, expect, it } from 'vitest';

import type { DebateLobbySummary } from '../api';
import { LOBBY_SOON_WINDOW_MS, lobbyLineup, nextLineupBoundary } from './live-lobbies';

const NOW = Date.parse('2026-10-13T18:00:00Z');
const at = (msFromNow: number) => new Date(NOW + msFromNow).toISOString();

const lobby = (overrides: Partial<DebateLobbySummary>): DebateLobbySummary => ({
  lobby_id: 'lobby',
  name: 'Lobby',
  scheduled: false,
  starts_at: at(0),
  opens_at: at(0),
  open: true,
  hosts: [],
  headcount: 1,
  avatars: [],
  debating_count: 0,
  reminder_count: 0,
  viewer_reminded: false,
  viewer_on_roster: false,
  ...overrides,
});

const scheduled = (id: string, opensIn: number) =>
  lobby({ lobby_id: id, scheduled: true, open: false, opens_at: at(opensIn), starts_at: at(opensIn + 10 * 60_000) });

describe('lobbyLineup', () => {
  it('puts the busiest live lobby first, breaking ties on how many are debating', () => {
    const quiet = lobby({ lobby_id: 'quiet', headcount: 2 });
    const busy = lobby({ lobby_id: 'busy', headcount: 9 });
    const busyDebating = lobby({ lobby_id: 'busy-debating', headcount: 9, debating_count: 4 });

    expect(lobbyLineup([quiet, busy, busyDebating], NOW).live.map(l => l.lobby_id)).toEqual([
      'busy-debating',
      'busy',
      'quiet',
    ]);
  });

  it('counts a host alone in the room as live', () => {
    expect(lobbyLineup([lobby({ headcount: 1 })], NOW).live).toHaveLength(1);
  });

  it('makes the next lobby opening within 15 minutes the soon one, and lists the rest as later', () => {
    const lineup = lobbyLineup(
      [scheduled('tomorrow', 24 * 60 * 60_000), scheduled('in-20', 20 * 60_000), scheduled('in-10', 10 * 60_000)],
      NOW
    );

    expect(lineup.soon?.lobby_id).toBe('in-10');
    expect(lineup.later.map(l => l.lobby_id)).toEqual(['in-20', 'tomorrow']);
  });

  it('starts the soon window exactly 15 minutes out', () => {
    expect(lobbyLineup([scheduled('edge', LOBBY_SOON_WINDOW_MS)], NOW).soon?.lobby_id).toBe('edge');
    expect(lobbyLineup([scheduled('past-edge', LOBBY_SOON_WINDOW_MS + 1)], NOW).soon).toBeNull();
  });

  it('keeps a lobby past its opening time as soon until the server opens it', () => {
    expect(lobbyLineup([scheduled('late', -30_000)], NOW).soon?.lobby_id).toBe('late');
  });
});

describe('nextLineupBoundary', () => {
  it('is the moment the next scheduled lobby enters the soon window', () => {
    const lobbies = [scheduled('in-40', 40 * 60_000), scheduled('in-20', 20 * 60_000), lobby({ lobby_id: 'live' })];
    expect(nextLineupBoundary(lobbies, NOW)).toBe(NOW + 5 * 60_000);
  });

  it('is null once every scheduled lobby is already inside the window', () => {
    expect(nextLineupBoundary([scheduled('in-5', 5 * 60_000)], NOW)).toBeNull();
  });
});

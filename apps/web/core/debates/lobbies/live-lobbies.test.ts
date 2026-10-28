import { describe, expect, it } from 'vitest';

import type { DebateLobbySummary } from '../api';
import { lobbyLineup } from './live-lobbies';

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

describe('lobbyLineup', () => {
  it('puts the busiest live lobby first, breaking ties on how many are debating', () => {
    const quiet = lobby({ lobby_id: 'quiet', headcount: 2 });
    const busy = lobby({ lobby_id: 'busy', headcount: 9 });
    const busyDebating = lobby({ lobby_id: 'busy-debating', headcount: 9, debating_count: 4 });

    expect(lobbyLineup([quiet, busy, busyDebating]).live.map(l => l.lobby_id)).toEqual([
      'busy-debating',
      'busy',
      'quiet',
    ]);
  });

  it('counts a host alone in the room as live', () => {
    expect(lobbyLineup([lobby({ headcount: 1 })]).live).toHaveLength(1);
  });

  it('leaves a lobby still to open out', () => {
    expect(lobbyLineup([lobby({ scheduled: true, open: false })]).live).toEqual([]);
  });
});

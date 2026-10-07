import { describe, expect, it } from 'vitest';

import type { DebateLobbySummary } from '../api';
import { type DebateLobbyCard, applyLobbyCardPatch, parseLobbyCardPatch, sortLobbies } from './lobby-card-patch';

function summary(overrides: Partial<DebateLobbySummary> & { lobby_id: string }): DebateLobbySummary {
  return {
    name: overrides.lobby_id,
    scheduled: false,
    starts_at: '2026-10-07T12:00:00Z',
    opens_at: '2026-10-07T12:00:00Z',
    open: true,
    hosts: [],
    headcount: 1,
    avatars: [],
    debating_count: 0,
    reminder_count: 0,
    viewer_reminded: false,
    viewer_on_roster: false,
    ...overrides,
  };
}

function card(overrides: Partial<DebateLobbyCard> & { lobby_id: string }): DebateLobbyCard {
  const { viewer_reminded: _reminded, viewer_on_roster: _onRoster, ...rest } = summary(overrides);
  return rest;
}

const ids = (list: { lobbies: DebateLobbySummary[] }) => list.lobbies.map(lobby => lobby.lobby_id);

describe('parseLobbyCardPatch', () => {
  it('reads a listed card, with refill false when absent', () => {
    const lobby = card({ lobby_id: 'aa' });
    expect(parseLobbyCardPatch('aa', { status: 'listed', insert: true, as_of: '2026-10-07T12:00:03Z', lobby })).toEqual(
      { status: 'listed', insert: true, asOf: Date.parse('2026-10-07T12:00:03Z'), refill: false, lobby }
    );
  });

  it('reads a removal against the event’s lobby id, with its refill', () => {
    expect(parseLobbyCardPatch('aa', { status: 'removed', as_of: '2026-10-07T12:00:03Z', refill: true })).toEqual({
      status: 'removed',
      lobbyId: 'aa',
      asOf: Date.parse('2026-10-07T12:00:03Z'),
      refill: true,
    });
  });

  it.each([
    ['absent', undefined],
    ['an unknown status', { status: 'hidden' }],
    ['a listed card without as_of', { status: 'listed', lobby: card({ lobby_id: 'aa' }) }],
    ['a listed card without a lobby', { status: 'listed', as_of: '2026-10-07T12:00:03Z' }],
    ['a removal without as_of', { status: 'removed' }],
  ])('is null for %s, so the caller refetches', (_label, value) => {
    expect(parseLobbyCardPatch('aa', value)).toBeNull();
  });

  it('is null for a removal with no lobby id', () => {
    expect(parseLobbyCardPatch(undefined, { status: 'removed', as_of: '2026-10-07T12:00:03Z' })).toBeNull();
  });
});

describe('applyLobbyCardPatch', () => {
  const asOf = Date.parse('2026-10-07T12:00:03Z');

  it('replaces a cached row and keeps the viewer’s fields', () => {
    const list = { lobbies: [summary({ lobby_id: 'aa', viewer_reminded: true, viewer_on_roster: true })] };

    const next = applyLobbyCardPatch(list, {
      status: 'listed',
      insert: false,
      refill: false,
      asOf,
      lobby: card({ lobby_id: 'aa', headcount: 4, name: 'Renamed' }),
    });

    expect(next.lobbies[0]).toMatchObject({
      name: 'Renamed',
      headcount: 4,
      viewer_reminded: true,
      viewer_on_roster: true,
    });
  });

  it('matches the cached row across uuid spellings', () => {
    const list = { lobbies: [summary({ lobby_id: '0192abcd', viewer_reminded: true })] };

    const next = applyLobbyCardPatch(list, {
      status: 'listed',
      insert: false,
      refill: false,
      asOf,
      lobby: card({ lobby_id: '0192-ABCD', headcount: 9 }),
    });

    expect(next.lobbies).toHaveLength(1);
    expect(next.lobbies[0]).toMatchObject({ headcount: 9, viewer_reminded: true });
  });

  it('adds a missing row only on insert, as not reminded and not on the roster', () => {
    const list = { lobbies: [summary({ lobby_id: 'aa' })] };
    const lobby = card({ lobby_id: 'bb', headcount: 3 });

    expect(applyLobbyCardPatch(list, { status: 'listed', insert: false, refill: false, asOf, lobby })).toBe(list);

    const inserted = applyLobbyCardPatch(list, { status: 'listed', insert: true, refill: false, asOf, lobby });
    expect(ids(inserted)).toEqual(['bb', 'aa']);
    expect(inserted.lobbies[0]).toMatchObject({ viewer_reminded: false, viewer_on_roster: false });
  });

  it('drops a removed row and leaves a list without it alone', () => {
    const list = { lobbies: [summary({ lobby_id: 'aa' }), summary({ lobby_id: 'bb' })] };

    expect(ids(applyLobbyCardPatch(list, { status: 'removed', lobbyId: 'AA', asOf: 0, refill: false }))).toEqual([
      'bb',
    ]);
    expect(applyLobbyCardPatch(list, { status: 'removed', lobbyId: 'cc', asOf: 0, refill: false })).toBe(list);
  });
});

describe('sortLobbies', () => {
  it('puts open lobbies first, busiest first, then upcoming soonest first, then by id', () => {
    const sorted = sortLobbies([
      summary({ lobby_id: 'later', open: false, starts_at: '2026-10-08T12:00:00Z' }),
      summary({ lobby_id: 'quiet', headcount: 1 }),
      summary({ lobby_id: 'soon', open: false, starts_at: '2026-10-07T13:00:00Z' }),
      summary({ lobby_id: 'busy-b', headcount: 6 }),
      summary({ lobby_id: 'busy-a', headcount: 6 }),
    ]);

    expect(sorted.map(lobby => lobby.lobby_id)).toEqual(['busy-a', 'busy-b', 'quiet', 'soon', 'later']);
  });
});

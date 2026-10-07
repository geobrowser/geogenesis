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
    as_of: '2026-10-07T12:00:01Z',
    ...overrides,
  };
}

function card(overrides: Partial<DebateLobbyCard> & { lobby_id: string }): DebateLobbyCard {
  const { viewer_reminded: _reminded, viewer_on_roster: _onRoster, as_of: _asOf, ...rest } = summary(overrides);
  return rest;
}

describe('parseLobbyCardPatch', () => {
  it('reads a listed card', () => {
    const lobby = card({ lobby_id: 'aa' });
    expect(parseLobbyCardPatch({ status: 'listed', as_of: '2026-10-07T12:00:03Z', lobby })).toEqual({
      asOf: '2026-10-07T12:00:03Z',
      lobby,
    });
  });

  it.each([
    ['absent', undefined],
    ['another status', { status: 'removed', as_of: '2026-10-07T12:00:03Z' }],
    ['a card without as_of', { status: 'listed', lobby: card({ lobby_id: 'aa' }) }],
    ['a card with an unreadable as_of', { status: 'listed', as_of: 'soon', lobby: card({ lobby_id: 'aa' }) }],
    ['a card without a lobby', { status: 'listed', as_of: '2026-10-07T12:00:03Z' }],
  ])('is null for %s, so the caller refetches', (_label, value) => {
    expect(parseLobbyCardPatch(value)).toBeNull();
  });
});

describe('applyLobbyCardPatch', () => {
  const asOf = '2026-10-07T12:00:03Z';

  it('replaces a cached row, keeps the viewer’s fields and takes the patch’s as_of', () => {
    const list = { lobbies: [summary({ lobby_id: 'aa', viewer_reminded: true, viewer_on_roster: true })] };

    const next = applyLobbyCardPatch(list, { asOf, lobby: card({ lobby_id: 'aa', headcount: 4, name: 'Renamed' }) });

    expect(next.lobbies[0]).toMatchObject({
      name: 'Renamed',
      headcount: 4,
      viewer_reminded: true,
      viewer_on_roster: true,
      as_of: asOf,
    });
  });

  it('matches the cached row across uuid spellings', () => {
    const list = { lobbies: [summary({ lobby_id: '0192abcd', viewer_reminded: true })] };

    const next = applyLobbyCardPatch(list, { asOf, lobby: card({ lobby_id: '0192-ABCD', headcount: 9 }) });

    expect(next.lobbies).toHaveLength(1);
    expect(next.lobbies[0]).toMatchObject({ headcount: 9, viewer_reminded: true });
  });

  it('never adds a lobby the list does not have', () => {
    const list = { lobbies: [summary({ lobby_id: 'aa' })] };

    expect(applyLobbyCardPatch(list, { asOf, lobby: card({ lobby_id: 'bb' }) })).toBe(list);
  });

  it.each([
    ['older', '2026-10-07T12:00:00Z'],
    ['equal', '2026-10-07T12:00:01Z'],
  ])('drops a patch %s than the row', (_label, patchAsOf) => {
    const list = { lobbies: [summary({ lobby_id: 'aa', headcount: 2 })] };

    expect(applyLobbyCardPatch(list, { asOf: patchAsOf, lobby: card({ lobby_id: 'aa', headcount: 7 }) })).toBe(list);
  });

  it.each([null, undefined])('applies to a row whose as_of is %s', rowAsOf => {
    const list = { lobbies: [summary({ lobby_id: 'aa', as_of: rowAsOf })] };

    expect(applyLobbyCardPatch(list, { asOf, lobby: card({ lobby_id: 'aa', headcount: 7 }) }).lobbies[0]).toMatchObject(
      { headcount: 7 }
    );
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

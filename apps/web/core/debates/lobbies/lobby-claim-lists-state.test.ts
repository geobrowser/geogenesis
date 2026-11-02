import { describe, expect, it } from 'vitest';

import type { DebateLobbyClaimList, DebateLobbyView } from '../api';
import {
  orderedClaimLists,
  parseLobbyClaimLists,
  settleFetchedLobbyClaimLists,
  withLobbyClaimLists,
} from './lobby-claim-lists-state';

const list = (entityId: string, position: number): DebateLobbyClaimList => ({
  entity_id: entityId,
  space_id: 's1',
  position,
  added_by: null,
  added_at: '2026-10-13T12:00:00Z',
});

describe('parseLobbyClaimLists', () => {
  it('reads the full state', () => {
    const state = { lobby_id: 'l1', as_of: null, claim_lists: [list('p1', 0)] };
    expect(parseLobbyClaimLists(state)).toEqual(state);
  });

  it.each([
    ['no lobby id', { as_of: null, claim_lists: [] }],
    ['a list that is not an array', { lobby_id: 'l1', as_of: null, claim_lists: {} }],
    ['a row without a space', { lobby_id: 'l1', as_of: null, claim_lists: [{ entity_id: 'p1', position: 0 }] }],
    ['a numeric stamp', { lobby_id: 'l1', as_of: 3, claim_lists: [] }],
    ['a stamp that is not an instant', { lobby_id: 'l1', as_of: 'yesterday', claim_lists: [] }],
  ])('refuses %s', (_label, value) => {
    expect(parseLobbyClaimLists(value)).toBeNull();
  });
});

describe('withLobbyClaimLists', () => {
  const view = { claim_lists: [list('p1', 0)], claim_lists_as_of: '2026-10-13T12:00:00.000100Z' };

  it('takes newer lists, compared to the microsecond', () => {
    const next = withLobbyClaimLists(view, {
      lobby_id: 'l1',
      as_of: '2026-10-13T12:00:00.000200Z',
      claim_lists: [list('p1', 0), list('p2', 1)],
    });
    expect(next.claim_lists).toHaveLength(2);
    expect(next.claim_lists_as_of).toBe('2026-10-13T12:00:00.000200Z');
  });

  it('keeps the view itself for the same or an older state', () => {
    expect(withLobbyClaimLists(view, { lobby_id: 'l1', as_of: view.claim_lists_as_of, claim_lists: [] })).toBe(view);
    expect(withLobbyClaimLists(view, { lobby_id: 'l1', as_of: '2026-10-13T11:00:00Z', claim_lists: [] })).toBe(view);
  });

  // Taken, an unreadable stamp would refuse every valid change after it, freezing the lists.
  it('never takes a state whose stamp cannot be read, even over none', () => {
    const empty = { claim_lists: [], claim_lists_as_of: null };
    expect(withLobbyClaimLists(empty, { lobby_id: 'l1', as_of: 'garbage', claim_lists: [list('p1', 0)] })).toBe(empty);
  });

  it('takes the first lists on a view from a geo-chat that had none', () => {
    const next = withLobbyClaimLists({} as Pick<DebateLobbyView, 'claim_lists' | 'claim_lists_as_of'>, {
      lobby_id: 'l1',
      as_of: '2026-10-13T12:00:00Z',
      claim_lists: [list('p1', 0)],
    });
    expect(next.claim_lists).toHaveLength(1);
  });
});

describe('settleFetchedLobbyClaimLists', () => {
  const fetched: { lobby_id: string; claim_lists: DebateLobbyClaimList[]; claim_lists_as_of: string | null } = {
    lobby_id: 'l1',
    claim_lists: [list('p1', 0)],
    claim_lists_as_of: '2026-10-13T12:00:00Z',
  };

  it('keeps cached lists an event laid down while the GET was in flight', () => {
    const cached = { ...fetched, claim_lists: [], claim_lists_as_of: '2026-10-13T12:00:01Z' };
    const settled = settleFetchedLobbyClaimLists(cached, fetched);
    expect(settled.claim_lists).toEqual([]);
    expect(settled.lobby_id).toBe('l1');
  });

  it('takes the GET otherwise', () => {
    expect(settleFetchedLobbyClaimLists(undefined, fetched)).toBe(fetched);
    expect(settleFetchedLobbyClaimLists({ ...fetched, claim_lists_as_of: null }, fetched)).toBe(fetched);
  });
});

describe('orderedClaimLists', () => {
  it('orders by position and treats a missing field as none', () => {
    expect(orderedClaimLists({ claim_lists: [list('b', 1), list('a', 0)] }).map(row => row.entity_id)).toEqual([
      'a',
      'b',
    ]);
    expect(orderedClaimLists({})).toEqual([]);
  });
});

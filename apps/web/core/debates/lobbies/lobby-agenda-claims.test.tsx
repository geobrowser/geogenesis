import { renderHook } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbyClaim, DebateLobbyClaims, DebateLobbyHighlights } from '../api';
import { AgendaClaimFilterContext, INACTIVE_AGENDA_FILTER } from '../todays-claims/agenda-claim-filter';
import { agendaFilterFixture } from '../todays-claims/debate-agenda-fixtures';
import {
  agendaHighlightsState,
  agendaLobbyClaims,
  hostAgendaFilter,
  useLobbyHostAgendaFilter,
  useLobbyRoomClaims,
} from './lobby-agenda-claims';

const mocks = vi.hoisted(() => ({
  hostLists: true,
  readArgs: [] as unknown[],
  query: {
    data: undefined as DebateLobbyClaims | undefined,
    isLoading: false,
    error: null as unknown,
    failureReason: null,
    refetch: vi.fn(),
  },
}));

vi.mock('../todays-claims/agenda-only-picker', () => ({
  AGENDA_ONLY_LOBBY: true,
  get AGENDA_ONLY_LOBBY_HOST_LISTS() {
    return mocks.hostLists;
  },
}));

vi.mock('./lobby-room-claims-hooks', () => ({
  useDebateLobbyClaims: (...args: unknown[]) => {
    mocks.readArgs = args;
    return mocks.query;
  },
}));

afterEach(() => {
  mocks.hostLists = true;
  mocks.query = { data: undefined, isLoading: false, error: null, failureReason: null, refetch: vi.fn() };
});

/** A room claim the viewer holds `viewer` on (or nothing), with `against` listed on the other side. */
function row(id: string, viewer: boolean | null, against: string[]): DebateLobbyClaim {
  return {
    claim: { id, space_id: 's1', claim_entity_id: `entity-${id}`, claim: `Claim ${id}`, description: null },
    response_kind: 'stance',
    viewer_response: viewer === null ? null : { position: viewer, position_label: viewer ? 'Agree' : 'Disagree' },
    viewer_debate_ready: true,
    readiness_disabled_reason: null,
    active_debate: false,
    positions: [true, false].map(position => ({
      position,
      position_label: position ? 'Agree' : 'Disagree',
      total_in_room: 1,
      requestable_count: 0,
      participants:
        viewer !== null && position !== viewer
          ? against.map(user_id => ({ user_id, requestable: true }) as never)
          : [{ user_id: 'with-viewer', requestable: true } as never],
    })),
  };
}

const room = (): DebateLobbyClaims => ({
  lobby_id: 'l1',
  source: 'room',
  claims: [row('a', true, ['ana', 'bo']), row('b', false, ['ana']), row('c', null, ['ana'])],
  disagreements: [
    { user_id: 'ana', claims: 2 },
    { user_id: 'bo', claims: 1 },
  ],
});

describe('agendaLobbyClaims', () => {
  it('leaves the room’s claims alone when the lobby is not agenda-only', () => {
    const data = room();
    expect(agendaLobbyClaims(data, INACTIVE_AGENDA_FILTER)).toBe(data);
  });

  it('keeps the agenda claims and counts each person’s disagreements again from them', () => {
    const narrowed = agendaLobbyClaims(room(), agendaFilterFixture({ ids: ['entity-b', 'entity-c'] }));

    expect(narrowed.claims.map(claim => claim.claim.id)).toEqual(['b', 'c']);
    // Only "b": "a" is on no agenda, and the viewer holds no side on "c". Nobody on the viewer's side.
    expect(narrowed.disagreements).toEqual([{ user_id: 'ana', claims: 1 }]);
  });

  it('counts a member’s by-id read, which comes with none, from its rows', () => {
    const narrowed = agendaLobbyClaims({ ...room(), disagreements: [] }, agendaFilterFixture({ ids: ['entity-a'] }));
    expect(narrowed.disagreements).toEqual([
      { user_id: 'ana', claims: 1 },
      { user_id: 'bo', claims: 1 },
    ]);
  });

  it('keeps a guest’s missing counts missing', () => {
    const narrowed = agendaLobbyClaims({ ...room(), disagreements: null }, agendaFilterFixture({ ids: ['entity-a'] }));
    expect(narrowed.disagreements).toBeNull();
  });
});

describe('agendaHighlightsState', () => {
  const state = (): Pick<DebateLobbyHighlights, 'highlights' | 'room_vote'> => ({
    highlights: [
      { claim: row('a', null, []).claim } as DebateLobbyHighlights['highlights'][number],
      { claim: row('b', null, []).claim } as DebateLobbyHighlights['highlights'][number],
    ],
    room_vote: { vote_id: 'v1', claim: row('b', null, []).claim } as NonNullable<DebateLobbyHighlights['room_vote']>,
  });

  it('passes everything when the lobby is not agenda-only', () => {
    const highlights = state();
    expect(agendaHighlightsState(highlights, INACTIVE_AGENDA_FILTER)).toBe(highlights);
  });

  it('keeps the agenda claims, and the vote only when its claim is one', () => {
    const onA = agendaHighlightsState(state(), agendaFilterFixture({ ids: ['entity-a'] }));
    expect(onA?.highlights.map(highlight => highlight.claim.id)).toEqual(['a']);
    expect(onA?.room_vote).toBeNull();

    const onB = agendaHighlightsState(state(), agendaFilterFixture({ ids: ['entity-b'] }));
    expect(onB?.room_vote?.vote_id).toBe('v1');
  });

  it('has nothing to say until the agendas answer, or when they fail', () => {
    expect(agendaHighlightsState(state(), agendaFilterFixture({ ids: ['entity-a'], pending: true }))).toBeUndefined();
    expect(agendaHighlightsState(state(), agendaFilterFixture({ error: new Error('down') }))).toBeUndefined();
  });
});

describe('hostAgendaFilter', () => {
  it('narrows a host’s picks under the host switch, and not with it off', () => {
    const filter = agendaFilterFixture({ ids: ['entity-a'] });
    expect(hostAgendaFilter(filter)).toBe(filter);

    mocks.hostLists = false;
    expect(hostAgendaFilter(filter)).toBe(INACTIVE_AGENDA_FILTER);

    const { result } = renderHook(() => useLobbyHostAgendaFilter(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <AgendaClaimFilterContext.Provider value={filter}>{children}</AgendaClaimFilterContext.Provider>
      ),
    });
    expect(result.current).toBe(INACTIVE_AGENDA_FILTER);
  });
});

describe('useLobbyRoomClaims', () => {
  const withFilter =
    (filter: ReturnType<typeof agendaFilterFixture>) =>
    ({ children }: { children: React.ReactNode }) => (
      <AgendaClaimFilterContext.Provider value={filter}>{children}</AgendaClaimFilterContext.Provider>
    );

  it('hands back nothing, loading, while the agendas are out', () => {
    mocks.query.data = room();
    const { result } = renderHook(() => useLobbyRoomClaims('l1'), {
      wrapper: withFilter(agendaFilterFixture({ ids: ['entity-a'], pending: true })),
    });
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(true);
  });

  it('fails with the agendas, and its retry asks for them rather than the room', () => {
    mocks.query.data = room();
    const error = new Error('gaia down');
    const refetch = vi.fn();
    const { result } = renderHook(() => useLobbyRoomClaims('l1'), {
      wrapper: withFilter(agendaFilterFixture({ error, refetch })),
    });
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBe(error);

    result.current.refetch();
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(mocks.query.refetch).not.toHaveBeenCalled();
  });

  it('narrows the room’s claims, and takes the filter handed to it over the provided one', () => {
    mocks.query.data = room();
    const { result } = renderHook(() => useLobbyRoomClaims('l1', true, agendaFilterFixture({ ids: ['entity-a'] })), {
      wrapper: withFilter(agendaFilterFixture({ ids: ['entity-b'] })),
    });
    expect(result.current.data?.claims.map(claim => claim.claim.id)).toEqual(['a']);
    // The agenda's claims read by id, not the room's top 50 narrowed.
    expect(mocks.readArgs).toEqual(['l1', true, ['entity-a']]);
    expect(result.current.data?.disagreements).toEqual([
      { user_id: 'ana', claims: 1 },
      { user_id: 'bo', claims: 1 },
    ]);

    result.current.refetch();
    expect(mocks.query.refetch).toHaveBeenCalledTimes(1);
  });

  it('is the room’s read as is outside an agenda-only lobby', () => {
    const data = room();
    mocks.query.data = data;
    const { result } = renderHook(() => useLobbyRoomClaims('l1'));
    expect(result.current.data).toBe(data);
    expect(mocks.readArgs).toEqual(['l1', true, null]);
  });
});

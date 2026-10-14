import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EntityResponseIndexingState } from '~/core/hooks/use-entity-vote';

import { type DebateLobbyHighlights, type DebateLobbyRoomVote, GeoChatRequestError } from '../api';
import {
  useEndLobbyRoomVote,
  useLobbyHighlights,
  useRoomVoteHint,
  useSetLobbyHighlight,
  useStartLobbyRoomVote,
} from './lobby-highlights-hooks';

const mocks = vi.hoisted(() => ({
  snapshot: { status: 'idle', pending: null, runId: null } as EntityResponseIndexingState,
  hint: vi.fn(async (..._args: unknown[]) => undefined),
  getHighlights: vi.fn(),
  setHighlight: vi.fn(),
  startVote: vi.fn(),
  endVote: vi.fn(),
  accountKey: 'user-a',
}));

const analytics = vi.hoisted(() => ({ lobbyRoomVoteStarted: vi.fn(), lobbyRoomVoteSeen: vi.fn() }));
vi.mock('./lobby-analytics', () => analytics);

vi.mock('~/core/hooks/use-entity-vote', () => ({
  useEntityResponseIndexingSnapshot: () => mocks.snapshot,
}));

vi.mock('../api', async importOriginal => ({
  ...(await importOriginal<typeof import('../api')>()),
  setDebateLobbyRoomVoteHint: mocks.hint,
  getDebateLobbyHighlights: mocks.getHighlights,
  setDebateLobbyHighlight: mocks.setHighlight,
  startDebateLobbyRoomVote: mocks.startVote,
  endDebateLobbyRoomVote: mocks.endVote,
}));

vi.mock('../hooks', () => ({
  debateQueryKeys: {
    lobbyHighlights: (accountKey: string | null, lobbyId: string) => [
      'debates',
      'account',
      accountKey,
      'lobby-highlights',
      lobbyId,
    ],
  },
  debateQueryNetworkOptions: { retry: false },
  useGeoChatAuth: () => ({
    accountKey: mocks.accountKey,
    authenticated: true,
    ready: true,
    getPrivyIdentityToken: getToken,
  }),
}));

const getToken = vi.fn();

const vote: DebateLobbyRoomVote = {
  vote_id: 'VOTE-1',
  claim: { id: 'c', space_id: 's', claim_entity_id: 'e', claim: 'Claim', description: null },
  started_by: null,
  started_at: '2026-10-07T12:00:00Z',
  tally: { agree: 0, disagree: 0, eligible: 2 },
};

const idle: EntityResponseIndexingState = { status: 'idle', pending: null, runId: null };
const run = (runId: string, status: 'reconciling' | 'indexed', expected: 'positive' | 'negative' | null) =>
  ({
    status,
    runId,
    pending: { entityId: 'e', spaceId: 's', personalSpaceId: 'p', responseKind: 'stance', expectedResponse: expected },
  }) as EntityResponseIndexingState;

beforeEach(() => {
  mocks.snapshot = idle;
  mocks.getHighlights.mockReset();
  mocks.setHighlight.mockReset();
  mocks.hint.mockClear();
  mocks.accountKey = 'user-a';
});

describe('useRoomVoteHint', () => {
  /** Rerenders, then lets the hint in flight settle so a queued one can go. */
  const step = async (rerender: () => void) => {
    rerender();
    await act(async () => undefined);
  };

  it('hints a vote as its write starts and withdraws it when the write rolls back', async () => {
    const { rerender } = renderHook(() => useRoomVoteHint('LOBBY-1', vote, true));
    expect(mocks.hint).not.toHaveBeenCalled();

    mocks.snapshot = run('r1', 'reconciling', 'negative');
    await step(rerender);
    expect(mocks.hint).toHaveBeenLastCalledWith('lobby1', 'VOTE-1', false, getToken, 'user-a');

    mocks.snapshot = idle;
    await step(rerender);
    expect(mocks.hint).toHaveBeenLastCalledWith('lobby1', 'VOTE-1', undefined, getToken, 'user-a');
    expect(mocks.hint).toHaveBeenCalledTimes(2);
  });

  it('hints the earlier side again when a newer write fails and restores it', async () => {
    const { rerender } = renderHook(() => useRoomVoteHint('lobby1', vote, true));
    mocks.snapshot = run('r1', 'reconciling', 'negative');
    await step(rerender);
    mocks.snapshot = run('r2', 'reconciling', 'positive');
    await step(rerender);
    expect(mocks.hint).toHaveBeenLastCalledWith('lobby1', 'VOTE-1', true, getToken, 'user-a');

    mocks.snapshot = run('r1', 'reconciling', 'negative');
    await step(rerender);
    expect(mocks.hint).toHaveBeenLastCalledWith('lobby1', 'VOTE-1', false, getToken, 'user-a');
    await step(rerender);
    expect(mocks.hint).toHaveBeenCalledTimes(3);
  });

  it('sends one hint at a time, and drops what is queued when the vote changes', async () => {
    let land = () => undefined as void;
    mocks.hint.mockImplementationOnce(() => new Promise<undefined>(resolve => (land = () => resolve(undefined))));
    const { rerender } = renderHook(({ current }) => useRoomVoteHint('lobby1', current, true), {
      initialProps: { current: vote },
    });
    mocks.snapshot = run('r1', 'reconciling', 'positive');
    rerender({ current: vote });
    mocks.snapshot = run('r2', 'reconciling', 'negative');
    rerender({ current: vote });
    expect(mocks.hint.mock.calls.map(call => [call[1], call[2]])).toEqual([['VOTE-1', true]]);

    const next = { ...vote, vote_id: 'VOTE-2' };
    rerender({ current: next });
    await act(async () => {
      land();
    });
    expect(mocks.hint.mock.calls.map(call => [call[1], call[2]])).toEqual([
      ['VOTE-1', true],
      ['VOTE-2', false],
    ]);
  });

  it('still sends the queued side when the page goes away', async () => {
    let land = () => undefined as void;
    mocks.hint.mockImplementationOnce(() => new Promise<undefined>(resolve => (land = () => resolve(undefined))));
    const { rerender, unmount } = renderHook(() => useRoomVoteHint('lobby1', vote, true));
    mocks.snapshot = run('r1', 'reconciling', 'positive');
    rerender();
    mocks.snapshot = run('r2', 'reconciling', 'negative');
    rerender();
    unmount();
    await act(async () => {
      land();
    });
    expect(mocks.hint.mock.calls.map(call => call[2])).toEqual([true, false]);
  });

  it('builds a fresh sender for another account on the same vote', async () => {
    mocks.snapshot = run('r1', 'reconciling', 'positive');
    const { rerender } = renderHook(() => useRoomVoteHint('lobby1', vote, true));
    await act(async () => undefined);
    mocks.accountKey = 'user-b';
    rerender();
    await act(async () => undefined);
    expect(mocks.hint.mock.calls.map(call => [call[2], call[4]])).toEqual([
      [true, 'user-a'],
      [true, 'user-b'],
    ]);
  });

  it('leaves an indexed vote to the response-indexed report', () => {
    const { rerender } = renderHook(() => useRoomVoteHint('lobby1', vote, true));
    mocks.snapshot = run('r1', 'reconciling', 'positive');
    rerender();
    mocks.snapshot = run('r1', 'indexed', 'positive');
    rerender();
    mocks.snapshot = idle;
    rerender();
    expect(mocks.hint).toHaveBeenCalledTimes(1);
  });

  it('sends nothing outside the room or without a vote', () => {
    mocks.snapshot = run('r1', 'reconciling', 'positive');
    renderHook(() => useRoomVoteHint('lobby1', vote, false));
    renderHook(() => useRoomVoteHint('lobby1', null, true));
    expect(mocks.hint).not.toHaveBeenCalled();
  });
});

describe('useLobbyHighlights', () => {
  it('retries a failed first GET rather than leaving the highlights hidden', async () => {
    const state: DebateLobbyHighlights = {
      lobby_id: 'lobby1',
      as_of: '2026-10-07T12:00:01Z',
      highlights: [{ claim: vote.claim, highlighted_by: null, highlighted_at: '2026-10-07T12:00:01Z' }],
      room_vote: null,
    };
    mocks.getHighlights
      .mockRejectedValueOnce(new GeoChatRequestError('busy', 'unavailable', 503))
      .mockResolvedValueOnce({ ...state, viewer: { room_vote_position: null } });
    const client = new QueryClient();
    const { result } = renderHook(() => useLobbyHighlights('lobby1'), {
      wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });

    await waitFor(() => expect(result.current.data?.highlights.map(row => row.claim.id)).toEqual(['c']), {
      timeout: 5000,
    });
    expect(mocks.getHighlights).toHaveBeenCalledTimes(2);
  });

  it('does not retry a refusal', async () => {
    mocks.getHighlights.mockRejectedValue(new GeoChatRequestError('not here', 'lobby_not_member', 403));
    const client = new QueryClient();
    const { result } = renderHook(() => useLobbyHighlights('lobby1'), {
      wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mocks.getHighlights).toHaveBeenCalledTimes(1);
  });
});

describe('host actions', () => {
  it('show their state after the first GET failed', async () => {
    // A refusal, so the read fails at once rather than after its transient retries.
    mocks.getHighlights.mockRejectedValueOnce(new GeoChatRequestError('bad', 'bad_request', 400));
    const highlighted: DebateLobbyHighlights = {
      lobby_id: 'lobby1',
      as_of: '2026-10-07T12:00:01Z',
      highlights: [{ claim: vote.claim, highlighted_by: null, highlighted_at: '2026-10-07T12:00:01Z' }],
      room_vote: null,
    };
    mocks.setHighlight.mockResolvedValueOnce(highlighted);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () => ({ read: useLobbyHighlights('lobby1'), highlight: useSetLobbyHighlight('lobby1') }),
      { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }
    );
    await waitFor(() => expect(result.current.read.isError).toBe(true));

    await act(() => result.current.highlight.mutateAsync({ claimId: 'c', highlighted: true }));

    await waitFor(() => expect(result.current.read.data?.highlights.map(row => row.claim.id)).toEqual(['c']));
    expect(result.current.read.data?.viewer).toEqual({ room_vote_position: null, vote_id: null });
  });
});

describe('room vote analytics (GEO-3311)', () => {
  const state = (roomVote: DebateLobbyRoomVote | null, asOf = '2026-10-07T12:00:00Z'): DebateLobbyHighlights => ({
    lobby_id: 'L',
    as_of: asOf,
    highlights: [],
    room_vote: roomVote,
  });
  let client: QueryClient;
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  /** A gateway event that landed before the mutation's response. */
  const overtakenBy = (newer: DebateLobbyHighlights) =>
    client.setQueryData(['debates', 'account', 'user-a', 'lobby-highlights', 'L'], {
      ...newer,
      viewer: { room_vote_position: null, vote_id: newer.room_vote?.vote_id ?? null },
    });
  const otherVote: DebateLobbyRoomVote = { ...vote, vote_id: 'VOTE-2', tally: { agree: 3, disagree: 1, eligible: 5 } };

  beforeEach(() => {
    client = new QueryClient();
    analytics.lobbyRoomVoteStarted.mockClear();
    analytics.lobbyRoomVoteSeen.mockClear();
  });

  it('reports a started vote, and whether it replaced another, once the server confirms it', async () => {
    mocks.startVote.mockResolvedValueOnce(state(vote));
    mocks.startVote.mockRejectedValueOnce(
      new GeoChatRequestError('running', 'lobby_room_vote_running', 409, null, null)
    );
    const { result } = renderHook(() => useStartLobbyRoomVote('L'), { wrapper });

    await act(() => result.current.mutateAsync({ claimId: 'c', replace: true }));
    await act(() => result.current.mutateAsync({ claimId: 'c' }).catch(() => undefined));

    expect(analytics.lobbyRoomVoteStarted.mock.calls).toEqual([['L', vote, { replaced: true }]]);
  });

  it('follows the room vote from the stored state, ending a replaced vote before the start is sent', async () => {
    mocks.startVote.mockResolvedValueOnce(state(vote));
    const order: string[] = [];
    analytics.lobbyRoomVoteSeen.mockImplementationOnce(() => order.push('seen'));
    analytics.lobbyRoomVoteStarted.mockImplementationOnce(() => order.push('started'));
    const { result } = renderHook(() => useStartLobbyRoomVote('L'), { wrapper });

    await act(() => result.current.mutateAsync({ claimId: 'c' }));

    expect(analytics.lobbyRoomVoteSeen).toHaveBeenCalledWith('L', vote);
    expect(order).toEqual(['seen', 'started']);
  });

  it('still reports a start a newer event overtook, without tracking the response over that event', async () => {
    // Another host replaced this vote before the response arrived.
    overtakenBy(state(otherVote, '2026-10-07T12:00:05Z'));
    mocks.startVote.mockResolvedValueOnce(state(vote, '2026-10-07T12:00:01Z'));
    const { result } = renderHook(() => useStartLobbyRoomVote('L'), { wrapper });

    await act(() => result.current.mutateAsync({ claimId: 'c' }));

    expect(analytics.lobbyRoomVoteSeen.mock.calls).toEqual([['L', otherVote]]);
    expect(analytics.lobbyRoomVoteStarted.mock.calls).toEqual([['L', vote, { replaced: false }]]);
  });

  it('reports the end from the stored state', async () => {
    mocks.endVote.mockResolvedValueOnce(state(null));
    const { result } = renderHook(() => useEndLobbyRoomVote('L'), { wrapper });

    await act(() => result.current.mutateAsync('VOTE-1'));

    expect(analytics.lobbyRoomVoteSeen).toHaveBeenCalledWith('L', null);
  });

  it('does not end a newer vote with an End response that a newer event overtook', async () => {
    overtakenBy(state(otherVote, '2026-10-07T12:00:05Z'));
    mocks.endVote.mockResolvedValueOnce(state(null, '2026-10-07T12:00:01Z'));
    const { result } = renderHook(() => useEndLobbyRoomVote('L'), { wrapper });

    await act(() => result.current.mutateAsync('VOTE-1'));

    expect(analytics.lobbyRoomVoteSeen.mock.calls).toEqual([['L', otherVote]]);
  });
});

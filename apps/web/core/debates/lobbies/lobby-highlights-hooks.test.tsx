import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EntityResponseIndexingState } from '~/core/hooks/use-entity-vote';

import { type DebateLobbyHighlights, type DebateLobbyRoomVote, GeoChatRequestError } from '../api';
import { useLobbyHighlights, useRoomVoteHint, useSetLobbyHighlight } from './lobby-highlights-hooks';

const mocks = vi.hoisted(() => ({
  snapshot: { status: 'idle', pending: null, runId: null } as EntityResponseIndexingState,
  hint: vi.fn(async () => undefined),
  getHighlights: vi.fn(),
  setHighlight: vi.fn(),
}));

vi.mock('~/core/hooks/use-entity-vote', () => ({
  useEntityResponseIndexingSnapshot: () => mocks.snapshot,
}));

vi.mock('../api', async importOriginal => ({
  ...(await importOriginal<typeof import('../api')>()),
  setDebateLobbyRoomVoteHint: mocks.hint,
  getDebateLobbyHighlights: mocks.getHighlights,
  setDebateLobbyHighlight: mocks.setHighlight,
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
  useGeoChatAuth: () => ({ accountKey: 'user-a', authenticated: true, ready: true, getPrivyIdentityToken: getToken }),
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
  mocks.hint.mockClear();
});

describe('useRoomVoteHint', () => {
  it('hints a vote as its write starts and withdraws it when the write rolls back', () => {
    const { rerender } = renderHook(() => useRoomVoteHint('LOBBY-1', vote, true));
    expect(mocks.hint).not.toHaveBeenCalled();

    mocks.snapshot = run('r1', 'reconciling', 'negative');
    rerender();
    expect(mocks.hint).toHaveBeenLastCalledWith('lobby1', 'VOTE-1', false, getToken, 'user-a');

    mocks.snapshot = idle;
    rerender();
    expect(mocks.hint).toHaveBeenLastCalledWith('lobby1', 'VOTE-1', undefined, getToken, 'user-a');
    expect(mocks.hint).toHaveBeenCalledTimes(2);
  });

  it('hints the earlier side again when a newer write fails and restores it', () => {
    const { rerender } = renderHook(() => useRoomVoteHint('lobby1', vote, true));
    mocks.snapshot = run('r1', 'reconciling', 'negative');
    rerender();
    mocks.snapshot = run('r2', 'reconciling', 'positive');
    rerender();
    expect(mocks.hint).toHaveBeenLastCalledWith('lobby1', 'VOTE-1', true, getToken, 'user-a');

    mocks.snapshot = run('r1', 'reconciling', 'negative');
    rerender();
    expect(mocks.hint).toHaveBeenLastCalledWith('lobby1', 'VOTE-1', false, getToken, 'user-a');
    rerender();
    expect(mocks.hint).toHaveBeenCalledTimes(3);
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

describe('host actions', () => {
  it('show their state after the first GET failed', async () => {
    mocks.getHighlights.mockRejectedValueOnce(new GeoChatRequestError('busy', 'unavailable', 503));
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

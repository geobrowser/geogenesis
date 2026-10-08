import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EntityResponseIndexingState } from '~/core/hooks/use-entity-vote';

import type { DebateLobbyRoomVote } from '../api';
import { useRoomVoteHint } from './lobby-highlights-hooks';

const mocks = vi.hoisted(() => ({
  snapshot: { status: 'idle', pending: null, runId: null } as EntityResponseIndexingState,
  hint: vi.fn(async () => undefined),
}));

vi.mock('~/core/hooks/use-entity-vote', () => ({
  useEntityResponseIndexingSnapshot: () => mocks.snapshot,
}));

vi.mock('../api', async importOriginal => ({
  ...(await importOriginal<typeof import('../api')>()),
  setDebateLobbyRoomVoteHint: mocks.hint,
}));

vi.mock('../hooks', () => ({
  debateQueryKeys: {},
  debateQueryNetworkOptions: {},
  useGeoChatAuth: () => ({ accountKey: 'user-a', getPrivyIdentityToken: getToken }),
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

import { QueryClient } from '@tanstack/react-query';

import { describe, expect, it, vi } from 'vitest';

import { userEntityVotesQueryKey, votedEntityIdsPendingQueryKey } from '~/core/hooks/use-user-voted-entity-ids';
import { entityResponseCountsQueryKey } from '~/core/responses/entity-response';

import { type MemberVoteRecord, memberCurationDownvotesQueryKey } from './fetch-member-debate-votes';
import {
  DEBATE_VOTE_OVERLAY_TTL_MS,
  type DebateVoteOverlays,
  catchUpAfterIndexing,
  debateVoteOverlaysQueryKey,
  mergeDownvoteOverlays,
  recordsAfterWrite,
} from './use-debate-downvote';

const mocks = vi.hoisted(() => ({ indexed: true }));

vi.mock('~/core/responses/entity-response', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/responses/entity-response')>()),
  waitForIndexedEntityResponse: async () => mocks.indexed,
}));
vi.mock('~/core/io/queries', async () => {
  const { Effect } = await import('effect');
  return { getUserEntityResponse: () => Effect.succeed(null) };
});

const MEMBER = 'd4bee0928fb5405baba3b1513f085835';
const S1 = '11111111111111111111111111111111';
const S2 = '22222222222222222222222222222222';
const D1 = 'd1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1';
const D2 = 'd2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2';

const down = (objectId: string, spaceId: string, votedAt = '2026-11-01'): MemberVoteRecord => ({
  objectId,
  spaceId,
  direction: 'negative',
  votedAt,
});

describe('recordsAfterWrite', () => {
  it('replaces the vote in the written space and keeps the rest', () => {
    const before = [down(D1, S1), { ...down(D1, S2), direction: 'positive' as const }];
    expect(recordsAfterWrite(before, D1, S2, 'negative').map(r => [r.spaceId, r.direction])).toEqual([
      [S2, 'negative'],
      [S1, 'negative'],
    ]);
    expect(recordsAfterWrite(before, D1, S1, 'clear').map(r => r.spaceId)).toEqual([S2]);
  });
});

describe('mergeDownvoteOverlays', () => {
  it('lets a fresh overlay describe its debate, and an expired one fall back to the server', () => {
    const now = 1_000_000_000;
    const overlays: DebateVoteOverlays = {
      [D1]: { records: [], writtenAtMs: now },
      [D2]: { records: [down(D2, S2, '2026-11-05')], writtenAtMs: now - DEBATE_VOTE_OVERLAY_TTL_MS - 1 },
    };
    const merged = mergeDownvoteOverlays([down(D1, S1), down(D2, S1)], overlays, now);
    expect(merged.map(r => [r.objectId, r.spaceId])).toEqual([[D2, S1]]);
  });
});

describe('catchUpAfterIndexing', () => {
  it('refreshes what reads the vote once indexed, then clears the temporary entries', async () => {
    mocks.indexed = true;
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    client.setQueryData(debateVoteOverlaysQueryKey(MEMBER), { [D1]: { records: [], writtenAtMs: 5 } });
    client.setQueryData(votedEntityIdsPendingQueryKey(MEMBER, 'down'), { added: [], removed: [D1] });
    const onIndexed = vi.fn();

    await catchUpAfterIndexing({
      queryClient: client,
      authorSpaceId: MEMBER,
      debateId: D1,
      spaceId: S1,
      expected: null,
      writtenAtMs: 5,
      onIndexed,
    });

    expect(onIndexed).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: entityResponseCountsQueryKey(D1, S1, 0, 'curation') });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: memberCurationDownvotesQueryKey(MEMBER) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: userEntityVotesQueryKey(MEMBER, 'down') });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['curator-onboarding-status'] });
    expect(client.getQueryData(votedEntityIdsPendingQueryKey(MEMBER, 'down'))).toEqual({ added: [], removed: [] });
    expect(client.getQueryData(debateVoteOverlaysQueryKey(MEMBER))).toEqual({});
  });

  it('keeps the overlay and touches nothing while the vote isn’t indexed', async () => {
    mocks.indexed = false;
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    client.setQueryData(debateVoteOverlaysQueryKey(MEMBER), { [D1]: { records: [], writtenAtMs: 5 } });

    const indexed = await catchUpAfterIndexing({
      queryClient: client,
      authorSpaceId: MEMBER,
      debateId: D1,
      spaceId: S1,
      expected: 'negative',
      writtenAtMs: 5,
    });

    expect(indexed).toBe(false);
    expect(invalidate).not.toHaveBeenCalled();
    expect(client.getQueryData<DebateVoteOverlays>(debateVoteOverlaysQueryKey(MEMBER))?.[D1]).toBeDefined();
  });
});

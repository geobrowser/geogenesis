import { QueryClient } from '@tanstack/react-query';

import { describe, expect, it, vi } from 'vitest';

import { userEntityVotesQueryKey, votedEntityIdsPendingQueryKey } from '~/core/hooks/use-user-voted-entity-ids';
import { entityResponseCountsQueryKey } from '~/core/responses/entity-response';

import { type MemberVoteRecord, memberDebateDownvotesQueryKey } from './fetch-member-debate-votes';
import {
  DEBATE_VOTE_OVERLAY_TTL_MS,
  type DebateVoteOverlays,
  catchUpAfterIndexing,
  debateVoteOverlaysQueryKey,
  mergeDownvoteOverlays,
  recordsAfterWrite,
} from './use-debate-downvote';

const mocks = vi.hoisted(() => ({
  reads: [] as MemberVoteRecord[][],
  readCount: 0,
  sinces: [] as Array<number | null | undefined>,
}));

vi.mock('./fetch-member-debate-votes', async importOriginal => ({
  ...(await importOriginal<typeof import('./fetch-member-debate-votes')>()),
  // Answers like the server: only votes at or after `since`.
  fetchMemberDebateVotes: async (_member: string, _debate: string, options?: { since?: number | null }) => {
    const answer = mocks.reads[Math.min(mocks.readCount, mocks.reads.length - 1)] ?? [];
    mocks.readCount += 1;
    mocks.sinces.push(options?.since);
    const since = options?.since;
    return since == null ? answer : answer.filter(record => Date.parse(record.votedAt) >= since * 1000);
  },
}));

const FAST_POLL = { intervalMs: 1, maxAttempts: 5 };

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
    mocks.reads = [[]];
    mocks.readCount = 0;
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
      direction: 'clear',
      previousVotedAt: '2026-11-01T00:00:00Z',
      writtenAtMs: 5,
      since: null,
      onIndexed,
      poll: FAST_POLL,
    });

    expect(onIndexed).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: entityResponseCountsQueryKey(D1, S1, 0, 'curation') });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: memberDebateDownvotesQueryKey(MEMBER) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: userEntityVotesQueryKey(MEMBER, 'down') });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['curator-onboarding-status'] });
    expect(client.getQueryData(votedEntityIdsPendingQueryKey(MEMBER, 'down'))).toEqual({ added: [], removed: [] });
    expect(client.getQueryData(debateVoteOverlaysQueryKey(MEMBER))).toEqual({});
  });

  it('waits for a re-sent downvote’s voted_at to move past the old one', async () => {
    // The first reads still show October's downvote; only the third shows the new one.
    mocks.reads = [
      [down(D1, S1, '2026-10-01T00:00:00Z')],
      [down(D1, S1, '2026-10-01T00:00:00Z')],
      [down(D1, S1, '2026-11-12T00:00:00Z')],
    ];
    mocks.readCount = 0;
    const onIndexed = vi.fn();

    const indexed = await catchUpAfterIndexing({
      queryClient: new QueryClient(),
      authorSpaceId: MEMBER,
      debateId: D1,
      spaceId: S1,
      direction: 'negative',
      previousVotedAt: '2026-10-01T00:00:00Z',
      writtenAtMs: 5,
      since: null,
      onIndexed,
      poll: FAST_POLL,
    });

    expect(indexed).toBe(true);
    expect(mocks.readCount).toBe(3);
    expect(onIndexed).toHaveBeenCalledTimes(1);
  });

  it('a pre-launch downvote can’t pass for the new one: the check reads with the launch bound', async () => {
    const LAUNCH = Date.parse('2026-11-05T00:00:00Z') / 1000;
    // October's downvote predates the launch, so the bounded reads before the write saw nothing.
    const october = down(D1, S1, '2026-10-01T00:00:00Z');
    mocks.reads = [[october], [october], [down(D1, S1, '2026-11-12T00:00:00Z')]];
    mocks.readCount = 0;
    mocks.sinces = [];
    const client = new QueryClient();
    client.setQueryData(debateVoteOverlaysQueryKey(MEMBER), { [D1]: { records: [], writtenAtMs: 5 } });
    const onIndexed = vi.fn();

    const indexed = await catchUpAfterIndexing({
      queryClient: client,
      authorSpaceId: MEMBER,
      debateId: D1,
      spaceId: S1,
      direction: 'negative',
      previousVotedAt: null,
      writtenAtMs: 5,
      since: LAUNCH,
      onIndexed,
      poll: FAST_POLL,
    });

    // Not on the first read (which only held October's vote), only once the new vote showed.
    expect(indexed).toBe(true);
    expect(mocks.readCount).toBe(3);
    expect(mocks.sinces.every(since => since === LAUNCH)).toBe(true);
  });

  it('before launch, bounds the check by the write itself', async () => {
    const writtenAtMs = Date.parse('2026-11-12T00:00:00Z');
    mocks.reads = [[down(D1, S1, '2026-10-01T00:00:00Z')]];
    mocks.readCount = 0;
    mocks.sinces = [];
    const indexed = await catchUpAfterIndexing({
      queryClient: new QueryClient(),
      authorSpaceId: MEMBER,
      debateId: D1,
      spaceId: S1,
      direction: 'negative',
      previousVotedAt: null,
      writtenAtMs,
      since: null,
      poll: FAST_POLL,
    });
    expect(indexed).toBe(false);
    expect(mocks.sinces[0]).toBe(writtenAtMs / 1000 - 120);
  });

  it('when indexing never shows, still refreshes the reads and ends the overlay, without claiming it was indexed', async () => {
    mocks.reads = [[down(D1, S1, '2026-10-01T00:00:00Z')]];
    mocks.readCount = 0;
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    client.setQueryData(debateVoteOverlaysQueryKey(MEMBER), { [D1]: { records: [], writtenAtMs: 5 } });
    const onIndexed = vi.fn();

    const indexed = await catchUpAfterIndexing({
      queryClient: client,
      authorSpaceId: MEMBER,
      debateId: D1,
      spaceId: S1,
      direction: 'negative',
      previousVotedAt: '2026-10-01T00:00:00Z',
      writtenAtMs: 5,
      since: null,
      onIndexed,
      poll: FAST_POLL,
    });

    expect(indexed).toBe(false);
    expect(onIndexed).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: memberDebateDownvotesQueryKey(MEMBER) });
    expect(client.getQueryData(debateVoteOverlaysQueryKey(MEMBER))).toEqual({});
  });
});

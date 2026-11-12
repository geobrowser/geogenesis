import { describe, expect, it, vi } from 'vitest';

import { type RankersRead, rankedByLabel, rankedByText, refreshRankersAfterIndexing } from './use-best-debates-to-rank';
import type { BlockRanker } from './use-block-rankers';

const ranker = (name: string | null): BlockRanker =>
  ({
    spaceId: name ?? 'x',
    rankEntityId: 'r',
    position: 1,
    ballotSize: 3,
    name,
    avatarUrl: null,
  }) as unknown as BlockRanker;

function read(overrides: Partial<RankersRead> & { counts?: Record<string, number | null> }): RankersRead {
  const counts = overrides.counts ?? {};
  return {
    rankersOf: id =>
      counts[id] ? Array.from({ length: counts[id]! }, (_, i) => ranker(['Ana', 'Ben', 'Cy'][i] ?? null)) : [],
    rankerCount: id => (id in counts ? counts[id] : 0),
    isLoading: false,
    error: null,
    refetch: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('who has ranked a debate', () => {
  it('says "Nobody" only off a finished read', () => {
    expect(rankedByLabel(read({}), 'd')).toEqual({ kind: 'nobody' });
    expect(rankedByLabel(read({ isLoading: true }), 'd')).toEqual({ kind: 'unknown' });
    expect(rankedByLabel(read({ error: new Error('down') }), 'd')).toEqual({ kind: 'unknown' });
  });

  it("follows the reviewed reader's status and null counts", () => {
    expect(rankedByLabel(read({ status: 'loading', counts: { d: null } }), 'd')).toEqual({ kind: 'unknown' });
    expect(rankedByLabel(read({ status: 'error' }), 'd')).toEqual({ kind: 'unknown' });
    expect(rankedByLabel(read({ status: 'ready', counts: { d: null } }), 'd')).toEqual({ kind: 'unknown' });
    expect(rankedByLabel(read({ status: 'ready', counts: { d: 0 } }), 'd')).toEqual({ kind: 'nobody' });
  });

  it('names who has ranked it', () => {
    const label = rankedByLabel(read({ counts: { d: 3 } }), 'd');
    expect(label).toEqual({ kind: 'ranked', names: ['Ana', 'Ben', 'Cy'], count: 3 });
    if (label.kind !== 'ranked') throw new Error('expected ranked');
    expect(rankedByText(label)).toBe('Ranked by Ana, Ben and 1 other');
    expect(rankedByText({ kind: 'ranked', names: ['Ana'], count: 1 })).toBe('Ranked by Ana');
    expect(rankedByText({ kind: 'ranked', names: ['Ana', 'Ben'], count: 2 })).toBe('Ranked by Ana and Ben');
    expect(rankedByText({ kind: 'ranked', names: [], count: 2 })).toBe('Ranked by 2 people');
  });

  it('re-reads after indexing, preferring invalidate', async () => {
    const invalidate = vi.fn();
    const rankers = read({ invalidate });
    let settle!: () => void;
    refreshRankersAfterIndexing(rankers, new Promise<void>(resolve => (settle = resolve)));
    expect(invalidate).not.toHaveBeenCalled();
    settle();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(rankers.refetch).not.toHaveBeenCalled();
  });
});

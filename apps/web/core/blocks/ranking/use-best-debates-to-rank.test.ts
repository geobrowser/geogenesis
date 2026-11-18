import { describe, expect, it, vi } from 'vitest';

import { type RankersRead, rankedByLabel, rankedByText, refreshRankersAfterIndexing } from './use-best-debates-to-rank';
import type { BlockRanker } from './use-block-rankers';

const ranker = (name: string | null) => ({ name }) as unknown as BlockRanker;

function read(status: RankersRead['status'], counts: Record<string, number | null> = {}): RankersRead {
  const ready = status === 'ready';
  return {
    status,
    rankerCount: id => (!ready ? null : id in counts ? counts[id] : 0),
    rankersOf: id =>
      !ready ? null : Array.from({ length: counts[id] ?? 0 }, (_, i) => ranker(['Ana', 'Ben', 'Cy'][i] ?? null)),
    invalidate: vi.fn(async () => undefined),
  };
}

describe('who has ranked a debate', () => {
  it('says "Nobody" only when the read is ready and the count is 0', () => {
    expect(rankedByLabel(read('ready'), 'd')).toEqual({ kind: 'nobody' });
    expect(rankedByLabel(read('loading'), 'd')).toEqual({ kind: 'unknown' });
    expect(rankedByLabel(read('error'), 'd')).toEqual({ kind: 'unknown' });
    expect(rankedByLabel(read('disabled'), 'd')).toEqual({ kind: 'unknown' });
    expect(rankedByLabel(read('ready', { d: null }), 'd')).toEqual({ kind: 'unknown' });
  });

  it('names who has ranked it', () => {
    const label = rankedByLabel(read('ready', { d: 3 }), 'd');
    expect(label).toEqual({ kind: 'ranked', names: ['Ana', 'Ben', 'Cy'], count: 3 });
    if (label.kind !== 'ranked') throw new Error('expected ranked');
    expect(rankedByText(label)).toBe('Ranked by Ana, Ben and 1 other');
    expect(rankedByText({ kind: 'ranked', names: ['Ana'], count: 1 })).toBe('Ranked by Ana');
    expect(rankedByText({ kind: 'ranked', names: ['Ana', 'Ben'], count: 2 })).toBe('Ranked by Ana and Ben');
    expect(rankedByText({ kind: 'ranked', names: [], count: 2 })).toBe('Ranked by 2 people');
  });

  it('re-reads only once indexing has settled', async () => {
    const rankers = read('ready');
    let settle!: () => void;
    refreshRankersAfterIndexing(rankers, new Promise<void>(resolve => (settle = resolve)));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(rankers.invalidate).not.toHaveBeenCalled();
    settle();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(rankers.invalidate).toHaveBeenCalledTimes(1);
  });
});

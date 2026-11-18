import { describe, expect, it, vi } from 'vitest';

import { type BestDebatesPageFetchers, fetchMatchingDebates } from './best-debates-debates';

const row = (n: number) => ({ entityId: `d${n}`, spaceId: 's1', name: `Debate ${n}`, createdAtMs: n });

function pagedFetchers(total: number, pageSize: number): BestDebatesPageFetchers {
  return {
    recent: vi.fn(),
    spaces: vi.fn(),
    matching: vi.fn(async (_filter, after) => {
      const start = after ? Number(after) : 0;
      const items = Array.from({ length: Math.min(pageSize, total - start) }, (_, i) => row(start + i));
      const next = start + items.length;
      return { items, endCursor: String(next), hasNextPage: next < total };
    }),
  };
}

describe('fetchMatchingDebates', () => {
  it('reads every page, so the list holds the whole matching set', async () => {
    const fetchers = pagedFetchers(82, 10);
    const { debates, capped } = await fetchMatchingDebates({ and: [] }, fetchers);
    expect(debates).toHaveLength(82);
    expect(capped).toBe(false);
    expect(fetchers.matching).toHaveBeenCalledTimes(9);
  });

  it('stops at the cap and says so', async () => {
    const { debates, capped } = await fetchMatchingDebates(null, pagedFetchers(50, 10), 25);
    expect(debates).toHaveLength(25);
    expect(capped).toBe(true);
  });
});

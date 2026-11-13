import { describe, expect, it, vi } from 'vitest';

import {
  type BestDebatesPageFetchers,
  type RecentDebate,
  debateOwnSpaceId,
  fetchDebateOwnSpaces,
  fetchRecentDebates,
  foldDebateTypeRows,
  selectToRank,
} from './best-debates-debates';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 11, 12);
const SPACE_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SPACE_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const ROOT = 'a19c345ab9866679b001d7d2138d88a1';

const debate = (entityId: string, ageDays: number): RecentDebate => ({
  entityId,
  name: entityId,
  createdAtMs: NOW - ageDays * DAY,
  spaceId: SPACE_A,
});

describe("a debate's own space", () => {
  it('is the space its Debate type lives in', () => {
    expect(debateOwnSpaceId([SPACE_B])).toBe(SPACE_B);
  });

  it('picks the same space whatever order the spaces come in', () => {
    expect(debateOwnSpaceId([SPACE_B, SPACE_A])).toBe(debateOwnSpaceId([SPACE_A, SPACE_B]));
    expect(debateOwnSpaceId([SPACE_B, SPACE_A])).toBe(SPACE_A);
  });

  it('lets the space ranking outrank the id order', () => {
    expect(debateOwnSpaceId([SPACE_A, ROOT])).toBe(ROOT);
  });

  it('is unknown when the debate is typed nowhere', () => {
    expect(debateOwnSpaceId([])).toBeNull();
  });

  it('folds one row per space into one debate per entity', () => {
    const folded = foldDebateTypeRows([
      { entityId: 'D1', spaceId: SPACE_B, name: 'One', createdAtMs: 1 },
      { entityId: 'd1', spaceId: SPACE_A, name: null, createdAtMs: 2 },
    ]);
    expect(folded).toEqual([{ entityId: 'd1', name: 'One', createdAtMs: 2, spaceId: SPACE_A }]);
  });
});

describe('To rank', () => {
  it("holds the last 7 days' debates, newest first while who ranked what isn't known", () => {
    const list = selectToRank([debate('old', 8), debate('d3', 3), debate('d0', 0), debate('d6', 6.9)], [], NOW);
    expect(list.map(d => d.entityId)).toEqual(['d0', 'd3', 'd6']);
  });

  it('puts debates nobody has ranked first, then newest', () => {
    const counts: Record<string, number | null> = { d0: 2, d3: 0, d5: 0, d1: null };
    const list = selectToRank([debate('d0', 0), debate('d1', 1), debate('d3', 3), debate('d5', 5)], [], NOW, {
      rankerCount: id => (id in counts ? counts[id] : 0),
    });
    // An unknown (null) count is never "nobody".
    expect(list.map(d => d.entityId)).toEqual(['d3', 'd5', 'd0', 'd1']);
  });

  it('leaves out what the ranker has placed, in any spelling', () => {
    const id = '11111111111111111111111111111111';
    const list = selectToRank([debate(id, 1), debate('other', 2)], ['11111111-1111-1111-1111-111111111111'], NOW);
    expect(list.map(d => d.entityId)).toEqual(['other']);
  });

  it('reads the window from the API by creation time and keeps debates with a space', async () => {
    const recent = vi.fn<BestDebatesPageFetchers['recent']>().mockResolvedValue({
      items: [
        { entityId: 'd1', spaceId: SPACE_A, name: 'One', createdAtMs: NOW - DAY },
        { entityId: 'd2', spaceId: SPACE_B, name: 'Two', createdAtMs: NOW - 2 * DAY },
      ],
      endCursor: null,
      hasNextPage: false,
    });
    const debates = await fetchRecentDebates(NOW, { recent, spaces: vi.fn() });
    expect(recent).toHaveBeenCalledWith(Math.floor((NOW - 7 * DAY) / 1000), undefined);
    expect(debates.map(d => d.entityId).sort()).toEqual(['d1', 'd2']);
  });
});

describe('fetchDebateOwnSpaces', () => {
  it('looks up every ballot item in chunks and leaves out debates typed nowhere', async () => {
    const ids = Array.from({ length: 450 }, (_, i) => i.toString(16).padStart(32, '0'));
    const spaces = vi.fn<BestDebatesPageFetchers['spaces']>().mockImplementation(async chunk => ({
      items: chunk.slice(1).map(entityId => ({ entityId, spaceId: SPACE_A, name: null, createdAtMs: 0 })),
      endCursor: null,
      hasNextPage: false,
    }));
    const result = await fetchDebateOwnSpaces(ids, { recent: vi.fn(), spaces });
    expect(spaces).toHaveBeenCalledTimes(3);
    expect(result.size).toBe(450 - 3);
    expect(result.has(ids[0])).toBe(false);
    expect(result.get(ids[1])).toBe(SPACE_A);
  });

  it('throws when a read fails, so a ballot never goes out half-resolved', async () => {
    const spaces = vi.fn<BestDebatesPageFetchers['spaces']>().mockRejectedValue(new Error('offline'));
    await expect(fetchDebateOwnSpaces(['d1'], { recent: vi.fn(), spaces })).rejects.toThrow('offline');
  });
});

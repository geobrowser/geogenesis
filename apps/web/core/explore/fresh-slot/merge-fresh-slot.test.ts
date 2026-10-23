import { describe, expect, it } from 'vitest';

import { DEFAULT_FRESH_SLOT_CONFIG, type FreshSlotConfig } from './fresh-slot-config';
import { mergeFreshSlot } from './merge-fresh-slot';

type Row = { id: string; type: string };

const best = (count: number, prefix = 'b'): Row[] =>
  Array.from({ length: count }, (_, i) => ({ id: `${prefix}${i}`, type: i % 3 === 0 ? 'debate' : 'claim' }));
const fresh = (types: string[]): Row[] => types.map((type, i) => ({ id: `f${i}`, type }));

const config = (overrides: Partial<FreshSlotConfig> = {}): FreshSlotConfig => ({
  ...DEFAULT_FRESH_SLOT_CONFIG,
  enabled: true,
  cadence: 4,
  firstPosition: 3,
  maxPerPage: 3,
  ...overrides,
});

function merge(args: { best: Row[]; fresh: Row[]; config?: FreshSlotConfig; shown?: Set<number>; pageSize?: number }) {
  return mergeFreshSlot({
    best: args.best,
    fresh: args.fresh,
    shown: args.shown ?? new Set(),
    config: args.config ?? config(),
    pageSize: args.pageSize ?? 22,
    idOf: row => row.id,
    typeOf: row => row.type,
  });
}

/** 1-based positions of fresh rows on each page. */
function freshPositions(rows: { fresh: boolean }[], pageSize = 22): number[][] {
  const pages: number[][] = [];
  rows.forEach((row, index) => {
    const page = Math.floor(index / pageSize);
    pages[page] ??= [];
    if (row.fresh) pages[page]!.push((index % pageSize) + 1);
  });
  return pages;
}

describe('the merge rule', () => {
  it('puts a fresh item every N positions from position P', () => {
    const { rows } = merge({ best: best(22), fresh: fresh(['claim', 'claim', 'claim']) });
    expect(freshPositions(rows)[0]).toEqual([3, 7, 11]);
  });

  it('honours other cadences and first positions', () => {
    const { rows } = merge({
      best: best(22),
      fresh: fresh(['claim', 'claim', 'claim', 'claim']),
      config: config({ cadence: 5, firstPosition: 2, maxPerPage: 4 }),
    });
    expect(freshPositions(rows)[0]).toEqual([2, 7, 12, 17]);
  });

  it('stops at K fresh items per page and starts again on the next page', () => {
    const { rows } = merge({
      best: best(60),
      fresh: fresh(Array(10).fill('claim')),
      config: config({ maxPerPage: 2 }),
    });
    const pages = freshPositions(rows);
    expect(pages[0]).toEqual([3, 7]);
    expect(pages[1]).toEqual([3, 7]);
    expect(pages[2]).toEqual([3, 7]);
  });

  it('keeps Best in its own order around the fresh items', () => {
    const { rows } = merge({ best: best(22), fresh: fresh(['claim']) });
    const bestIds = rows.filter(row => !row.fresh).map(row => row.row.id);
    expect(bestIds).toEqual(best(22).map(row => row.id));
    expect(rows).toHaveLength(23);
  });

  it('serves the newest fresh items first', () => {
    // 18 Best rows and 3 fresh items fill one page; a 23rd row would open a second page.
    const { rows } = merge({ best: best(18), fresh: fresh(['claim', 'claim', 'claim', 'claim']) });
    expect(rows.filter(row => row.fresh).map(row => row.row.id)).toEqual(['f0', 'f1', 'f2']);
  });

  it('caps one type per page, filling the slot with the next eligible fresh item', () => {
    const { rows } = merge({
      best: best(22),
      fresh: fresh(['debate', 'debate', 'claim', 'debate']),
      config: config({ perTypeCaps: { debate: 1 } }),
    });
    expect(rows.filter(row => row.fresh).map(row => row.row.id)).toEqual(['f0', 'f2']);
  });

  it('leaves a slot to Best when no fresh item is eligible', () => {
    const { rows } = merge({
      best: best(22),
      fresh: fresh(['debate', 'debate']),
      config: config({ perTypeCaps: { debate: 0 } }),
    });
    expect(rows.every(row => !row.fresh)).toBe(true);
    expect(rows).toHaveLength(22);
  });

  it('never adds fresh items past the end of Best', () => {
    const { rows } = merge({ best: best(2), fresh: fresh(['claim', 'claim']) });
    expect(rows.map(row => row.row.id)).toEqual(['b0', 'b1']);
    expect(merge({ best: [], fresh: fresh(['claim']) }).rows).toEqual([]);
  });

  it('adds nothing when disabled or K is 0', () => {
    expect(merge({ best: best(22), fresh: fresh(['claim']), config: config({ enabled: false }) }).rows).toHaveLength(
      22
    );
    expect(merge({ best: best(22), fresh: fresh(['claim']), config: config({ maxPerPage: 0 }) }).rows).toHaveLength(22);
  });
});

describe('dedupe and graduation', () => {
  it('shows an item already in Best from Best, without using a slot', () => {
    const window = best(22);
    const list: Row[] = [{ id: 'b10', type: 'claim' }, ...fresh(['claim', 'claim', 'claim'])];
    const { rows, shownAfter } = merge({ best: window, fresh: list });
    expect(rows.filter(row => row.row.id === 'b10')).toEqual([{ row: window[10], fresh: false }]);
    expect(rows.filter(row => row.fresh).map(row => row.row.id)).toEqual(['f0', 'f1', 'f2']);
    // Graduated counts as shown, so a later window cannot serve it as fresh.
    expect(shownAfter.has(0)).toBe(true);
  });

  it('drops from Best an item an earlier window already showed', () => {
    const list = fresh(['claim', 'claim']);
    const later: Row[] = [{ id: 'f0', type: 'claim' }, ...best(21)];
    const { rows } = merge({ best: later, fresh: list, shown: new Set([0]) });
    expect(rows.filter(row => row.row.id === 'f0')).toEqual([]);
    expect(rows.filter(row => row.fresh).map(row => row.row.id)).toEqual(['f1']);
  });

  it('records what it served, and what it did not reach stays available', () => {
    const { shownAfter } = merge({ best: best(18), fresh: fresh(Array(5).fill('claim')) });
    expect([...shownAfter].sort()).toEqual([0, 1, 2]);
  });

  it('serves one copy of a fresh item listed twice', () => {
    const list: Row[] = [
      { id: 'x', type: 'claim' },
      { id: 'x', type: 'claim' },
    ];
    const { rows } = merge({ best: best(22), fresh: list });
    expect(rows.filter(row => row.row.id === 'x')).toHaveLength(1);
  });

  it("doesn't depend on Best's order for its shape", () => {
    const window = best(50);
    const list = fresh(Array(8).fill('claim'));
    const forward = merge({ best: window, fresh: list });
    const reversed = merge({ best: [...window].reverse(), fresh: list });
    expect(freshPositions(reversed.rows)).toEqual(freshPositions(forward.rows));
    expect([...reversed.shownAfter]).toEqual([...forward.shownAfter]);
  });
});

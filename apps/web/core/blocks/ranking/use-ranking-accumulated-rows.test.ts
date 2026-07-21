import { describe, expect, it } from 'vitest';

import type { Row } from '~/core/types';

import { flattenRowPages, rankingFeedPageSize, upsertRowPage } from './use-ranking-accumulated-rows';

function row(entityId: string): Row {
  return { entityId, placeholder: false, columns: {} } as Row;
}

describe('upsertRowPage', () => {
  it('stores each fetched page separately', () => {
    const pages = upsertRowPage([], 0, [row('a'), row('b')]);
    const merged = upsertRowPage(pages, 1, [row('c'), row('d')]);
    expect(merged).toHaveLength(2);
    expect(flattenRowPages(merged).map(r => r.entityId)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('replaces a page when its row signature changes', () => {
    let pages = upsertRowPage([], 1, [row('a')]);
    pages = upsertRowPage(pages, 1, [row('b')]);
    expect(flattenRowPages(pages).map(r => r.entityId)).toEqual(['b']);
  });
});

describe('flattenRowPages', () => {
  it('dedupes entities across pages while preserving page order', () => {
    const pages = [
      { page: 0, rows: [row('a'), row('b')] },
      { page: 1, rows: [row('b'), row('c')] },
    ];
    expect(flattenRowPages(pages).map(r => r.entityId)).toEqual(['a', 'b', 'c']);
  });
});

describe('rankingFeedPageSize', () => {
  it('uses at least ten rows for the infinite feed', () => {
    expect(rankingFeedPageSize(1)).toBe(10);
    expect(rankingFeedPageSize(9)).toBe(10);
  });

  it('preserves configured page sizes above the minimum', () => {
    expect(rankingFeedPageSize(10)).toBe(10);
    expect(rankingFeedPageSize(25)).toBe(25);
  });
});

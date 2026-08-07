import { describe, expect, it } from 'vitest';

import { flattenIdPages, upsertIdPage } from './accumulate-id-pages';

describe('upsertIdPage', () => {
  it('keeps pages ordered by page index regardless of arrival order', () => {
    const pages = upsertIdPage(upsertIdPage([], 1, ['b']), 0, ['a']);

    expect(pages.map(page => page.page)).toEqual([0, 1]);
  });

  it('replaces a page whose ids changed', () => {
    const pages = upsertIdPage(upsertIdPage([], 0, ['a']), 0, ['a', 'b']);

    expect(pages).toEqual([{ page: 0, ids: ['a', 'b'] }]);
  });

  it('returns the same array when re-upserting an unchanged page', () => {
    const pages = upsertIdPage([], 0, ['a', 'b']);

    expect(upsertIdPage(pages, 0, ['a', 'b'])).toBe(pages);
  });
});

describe('flattenIdPages', () => {
  it('concatenates pages in page order', () => {
    const pages = upsertIdPage(upsertIdPage([], 1, ['c', 'd']), 0, ['a', 'b']);

    expect(flattenIdPages(pages)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps the first occurrence of a repeated id', () => {
    const pages = upsertIdPage(upsertIdPage([], 0, ['a', 'b']), 1, ['b', 'c']);

    expect(flattenIdPages(pages)).toEqual(['a', 'b', 'c']);
  });

  it('drops empty ids', () => {
    expect(flattenIdPages([{ page: 0, ids: ['a', '', 'b'] }])).toEqual(['a', 'b']);
  });
});

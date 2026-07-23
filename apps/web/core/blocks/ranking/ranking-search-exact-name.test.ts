import { describe, expect, it } from 'vitest';

import type { SearchResult } from '~/core/types';

import { rankingSearchHasExactNameMatch } from './ranking-search-exact-name';

function result(partial: Partial<SearchResult> & Pick<SearchResult, 'id'>): SearchResult {
  return {
    name: null,
    description: null,
    spaces: [],
    types: [],
    ...partial,
  };
}

describe('rankingSearchHasExactNameMatch', () => {
  it('returns false for empty or whitespace queries', () => {
    expect(rankingSearchHasExactNameMatch('', [result({ id: '1', name: 'Alpha' })])).toBe(false);
    expect(rankingSearchHasExactNameMatch('   ', [result({ id: '1', name: 'Alpha' })])).toBe(false);
  });

  it('matches trimmed case-insensitive names on search results', () => {
    const results = [result({ id: '1', name: 'Climate Policy' })];
    expect(rankingSearchHasExactNameMatch('climate policy', results)).toBe(true);
    expect(rankingSearchHasExactNameMatch('  Climate Policy  ', results)).toBe(true);
    expect(rankingSearchHasExactNameMatch('Climate', results)).toBe(false);
  });

  it('does not match names in namesBySpace when the display name differs', () => {
    const results = [
      result({
        id: '1',
        name: 'Other',
        namesBySpace: { spaceA: 'Exact Thing', spaceB: null },
      }),
    ];
    expect(rankingSearchHasExactNameMatch('exact thing', results)).toBe(false);
  });

  it('matches extra resolved display names', () => {
    expect(rankingSearchHasExactNameMatch('Widget', [], ['Widget'])).toBe(true);
    expect(rankingSearchHasExactNameMatch('Widget', [], ['Gadgets'])).toBe(false);
  });
});

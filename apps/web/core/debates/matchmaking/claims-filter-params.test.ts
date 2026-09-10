import { describe, expect, it } from 'vitest';

import { fromClaimsFilterSearch, toClaimsFilterSearch } from './claims-filter-params';

const NOTHING_NARROWED = { search: '', spaceIds: [], topicIds: [] };

describe('toClaimsFilterSearch', () => {
  it('leaves an unfiltered list with no query at all', () => {
    // So expanding from an untouched panel gives a bare `/matchmaking` worth sharing.
    expect(toClaimsFilterSearch(NOTHING_NARROWED)).toBe('');
  });

  it('carries every dimension the tab holds', () => {
    const search = toClaimsFilterSearch({
      search: 'climate',
      spaceIds: ['space-a', 'space-b'],
      topicIds: ['topic-a'],
    });

    const params = new URLSearchParams(search);
    expect(params.get('q')).toBe('climate');
    expect(params.get('spaces')).toBe('space-a,space-b');
    expect(params.get('topics')).toBe('topic-a');
  });

  it('omits a dimension rather than sending it empty', () => {
    expect(toClaimsFilterSearch({ ...NOTHING_NARROWED, topicIds: ['topic-a'] })).toBe('topics=topic-a');
  });

  it('does not carry whitespace typed into the search box', () => {
    expect(toClaimsFilterSearch({ ...NOTHING_NARROWED, search: '   ' })).toBe('');
  });
});

describe('fromClaimsFilterSearch', () => {
  const read = (search: string) => fromClaimsFilterSearch(new URLSearchParams(search));

  it('round-trips what the link wrote', () => {
    const filters = {
      search: 'energy policy',
      spaceIds: ['space-a', 'space-b'],
      topicIds: ['topic-a', 'topic-b'],
    };

    expect(read(toClaimsFilterSearch(filters))).toEqual(filters);
  });

  it('reads an empty query as no narrowing', () => {
    expect(read('')).toEqual(NOTHING_NARROWED);
  });

  /**
   * Which list the workspace shows is not the URL's to decide — it mounts Explore, and the other two
   * lists are tabs in the panel. A hand-written or bookmarked `scope` is ignored rather than honoured
   * halfway.
   */
  it('ignores a scope left over from a link that carried one', () => {
    expect(read('scope=matches&q=climate')).toEqual({ ...NOTHING_NARROWED, search: 'climate' });
  });

  it('survives the commas a hand-edited link leaves behind', () => {
    expect(read('topics=,topic-a,,topic-b,').topicIds).toEqual(['topic-a', 'topic-b']);
  });

  it('does not repeat an id that appears twice', () => {
    expect(read('spaces=space-a,space-a').spaceIds).toEqual(['space-a']);
  });

  it('trims a search that arrived padded', () => {
    expect(read('q=%20climate%20').search).toBe('climate');
  });
});

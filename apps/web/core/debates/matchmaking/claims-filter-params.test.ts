import { describe, expect, it } from 'vitest';

import { fromClaimsFilterSearch, toClaimsFilterSearch } from './claims-filter-params';

const LISTS = ['lobby', 'explore', 'positions'];

const NOTHING_NARROWED = { list: null, search: '', spaceIds: [], topicIds: [] };

describe('toClaimsFilterSearch', () => {
  it('leaves out the source the workspace opens on anyway', () => {
    expect(toClaimsFilterSearch({ ...NOTHING_NARROWED, list: 'lobby' }, 'lobby')).toBe('');
  });

  it('carries a source the viewer actually moved to', () => {
    expect(toClaimsFilterSearch({ ...NOTHING_NARROWED, list: 'explore' }, 'lobby')).toBe('list=explore');
  });

  it('leaves an unfiltered list with no query at all', () => {
    // So expanding from an untouched panel gives a bare `/matchmaking` worth sharing.
    expect(toClaimsFilterSearch(NOTHING_NARROWED)).toBe('');
  });

  it('carries every dimension the tab holds', () => {
    const search = toClaimsFilterSearch({
      list: null,
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
  const read = (search: string) => fromClaimsFilterSearch(new URLSearchParams(search), LISTS);

  it('round-trips what the link wrote', () => {
    const filters = {
      list: 'explore',
      search: 'energy policy',
      spaceIds: ['space-a', 'space-b'],
      topicIds: ['topic-a', 'topic-b'],
    };

    expect(read(toClaimsFilterSearch(filters))).toEqual(filters);
  });

  it('reads an empty query as no narrowing', () => {
    expect(read('')).toEqual(NOTHING_NARROWED);
  });

  // Drop a list the surface does not offer (stale link, typo, or signed-out).
  it('drops a list the surface does not offer', () => {
    expect(fromClaimsFilterSearch(new URLSearchParams('list=matches'), ['lobby', 'explore']).list).toBeNull();
  });

  it('ignores a scope left over from the param this replaced', () => {
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

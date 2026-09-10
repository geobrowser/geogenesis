import { describe, expect, it } from 'vitest';

import { DEFAULT_CLAIMS_SCOPE, fromClaimsFilterSearch, toClaimsFilterSearch } from './claims-filter-params';

const SCOPES = ['featured', 'all', 'mine', 'debate_now'];

const NOTHING_NARROWED = { scope: null, search: '', spaceIds: [], topicIds: [] };

describe('toClaimsFilterSearch', () => {
  it('leaves an unfiltered list with no query at all', () => {
    // So expanding from an untouched panel gives a bare `/matchmaking` worth sharing.
    expect(toClaimsFilterSearch(NOTHING_NARROWED)).toBe('');
  });

  it('carries every dimension the tab holds', () => {
    const search = toClaimsFilterSearch({
      scope: 'mine',
      search: 'climate',
      spaceIds: ['space-a', 'space-b'],
      topicIds: ['topic-a'],
    });

    const params = new URLSearchParams(search);
    expect(params.get('scope')).toBe('mine');
    expect(params.get('q')).toBe('climate');
    expect(params.get('spaces')).toBe('space-a,space-b');
    expect(params.get('topics')).toBe('topic-a');
  });

  it('omits a dimension rather than sending it empty', () => {
    const search = toClaimsFilterSearch({ ...NOTHING_NARROWED, scope: 'all' });

    expect(search).toBe('scope=all');
  });

  /**
   * The tab publishes whatever scope it is on, which is `featured` from the moment it mounts.
   */
  it('leaves out the scope the tab already opens on', () => {
    const search = toClaimsFilterSearch({ ...NOTHING_NARROWED, scope: DEFAULT_CLAIMS_SCOPE }, DEFAULT_CLAIMS_SCOPE);

    expect(search).toBe('');
  });

  it('still carries a scope the viewer actually chose', () => {
    const search = toClaimsFilterSearch({ ...NOTHING_NARROWED, scope: 'mine' }, DEFAULT_CLAIMS_SCOPE);

    expect(search).toBe('scope=mine');
  });

  it('does not carry whitespace typed into the search box', () => {
    expect(toClaimsFilterSearch({ ...NOTHING_NARROWED, search: '   ' })).toBe('');
  });
});

describe('fromClaimsFilterSearch', () => {
  const read = (search: string) => fromClaimsFilterSearch(new URLSearchParams(search), SCOPES);

  it('round-trips what the link wrote', () => {
    const filters = {
      scope: 'debate_now',
      search: 'energy policy',
      spaceIds: ['space-a', 'space-b'],
      topicIds: ['topic-a', 'topic-b'],
    };

    expect(read(toClaimsFilterSearch(filters))).toEqual(filters);
  });

  it('reads an empty query as no narrowing', () => {
    expect(read('')).toEqual(NOTHING_NARROWED);
  });

  it('drops a scope it does not recognise', () => {
    expect(read('scope=matches').scope).toBeNull();
  });

  it('drops a scope this viewer is not offered', () => {
    expect(fromClaimsFilterSearch(new URLSearchParams('scope=mine'), ['featured', 'all']).scope).toBeNull();
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

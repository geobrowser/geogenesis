import { describe, expect, it } from 'vitest';

import { MAX_SEARCH_QUERY_LENGTH } from '../io/search-query';
import { fuzzyPageCacheWhere } from './orm';

/**
 * GEO-2646. `buildSearchPath` caps what reaches the endpoint, but this is what decides whether a
 * request is made at all. Keyed on the raw query, every keystroke past the cap minted a fresh
 * entry for a byte-identical request — the fix would have stopped the 400s and then refetched the
 * same answer on every character after the hundredth.
 */
describe('fuzzyPageCacheWhere', () => {
  it('leaves a short query, and the object it came in, untouched', () => {
    const where = { name: { fuzzy: 'football' } };

    // Same reference: an ordinary query keeps its identity, so nothing re-renders on a new object.
    expect(fuzzyPageCacheWhere(where)).toBe(where);
  });

  it('caps a long query', () => {
    const where = { name: { fuzzy: 'a'.repeat(MAX_SEARCH_QUERY_LENGTH + 40) } };

    expect(fuzzyPageCacheWhere(where).name?.fuzzy).toHaveLength(MAX_SEARCH_QUERY_LENGTH);
  });

  // The point: two queries that differ only past the cap are one cache entry, not two.
  it('collapses queries that differ only past the cap', () => {
    const base = 'a'.repeat(MAX_SEARCH_QUERY_LENGTH);

    const first = fuzzyPageCacheWhere({ name: { fuzzy: `${base}first tail` } });
    const second = fuzzyPageCacheWhere({ name: { fuzzy: `${base}second, much longer tail` } });

    expect(first).toEqual(second);
  });

  it('keeps queries that differ within the cap apart', () => {
    const first = fuzzyPageCacheWhere({ name: { fuzzy: 'football' } });
    const second = fuzzyPageCacheWhere({ name: { fuzzy: 'footballer' } });

    expect(first).not.toEqual(second);
  });

  it('carries the rest of the filter through', () => {
    const where = {
      name: { fuzzy: 'a'.repeat(MAX_SEARCH_QUERY_LENGTH + 10) },
      space: { id: { equals: 'space-1' } },
      types: [{ id: { equals: 'type-1' } }],
    };

    const capped = fuzzyPageCacheWhere(where);

    expect(capped.space).toEqual(where.space);
    expect(capped.types).toEqual(where.types);
  });

  it('does not mind a filter with no query at all', () => {
    const where = { space: { id: { equals: 'space-1' } } };

    expect(fuzzyPageCacheWhere(where)).toBe(where);
  });
});

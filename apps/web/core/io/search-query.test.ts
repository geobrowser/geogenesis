import { describe, expect, it } from 'vitest';

import { MAX_SEARCH_QUERY_LENGTH, capSearchQuery } from './search-query';

/**
 * GEO-2646. The REST `/search` endpoint rejects a query over 250 characters with a 400, which the
 * app showed as a search that found nothing. Queries are capped well under that before they go.
 */
describe('capSearchQuery', () => {
  it('leaves an ordinary query alone', () => {
    expect(capSearchQuery('artificial intelligence')).toBe('artificial intelligence');
  });

  it('leaves a query exactly at the cap alone', () => {
    const exact = 'a'.repeat(MAX_SEARCH_QUERY_LENGTH);

    expect(capSearchQuery(exact)).toBe(exact);
  });

  it('caps a longer one at the limit', () => {
    const long = 'a'.repeat(MAX_SEARCH_QUERY_LENGTH + 50);

    expect(capSearchQuery(long)).toHaveLength(MAX_SEARCH_QUERY_LENGTH);
  });

  it('keeps the front of the query, which is the part that was typed first', () => {
    const long = `findable ${'x'.repeat(MAX_SEARCH_QUERY_LENGTH)}`;

    expect(capSearchQuery(long).startsWith('findable ')).toBe(true);
  });

  // A hard cut, deliberately: measured against the endpoint, a query cut mid-word returns the same
  // top results as the whole one, so the partial token costs nothing and keeps more of the query
  // than cutting back to the last space would.
  it('cuts mid-word rather than falling back to the last word boundary', () => {
    const query = `${'word '.repeat(19)}intelligence`;
    expect(query.length).toBeGreaterThan(MAX_SEARCH_QUERY_LENGTH);

    const capped = capSearchQuery(query);

    expect(capped).toHaveLength(MAX_SEARCH_QUERY_LENGTH);
    expect(capped.endsWith(' ')).toBe(false);
  });

  it('handles an unbroken token with no boundary to cut to', () => {
    const url = `https://example.com/${'a'.repeat(200)}`;

    expect(capSearchQuery(url)).toHaveLength(MAX_SEARCH_QUERY_LENGTH);
  });

  it('is a no-op on an empty query, which is how callers ask for top results', () => {
    expect(capSearchQuery('')).toBe('');
  });

  // A cut by UTF-16 code unit can land inside a surrogate pair. The lone half that leaves is worse
  // than the bug being fixed: `URLSearchParams` swaps it for a replacement character and
  // `encodeURIComponent` throws `URI malformed` outright.
  describe('multi-byte characters', () => {
    const emoji = `a${'👍'.repeat(150)}`;

    it('is long enough to be cut', () => {
      // Guards the fixture itself: at 81 code points an earlier version of this was under the cap,
      // so every assertion below held without a single character being removed.
      expect([...emoji].length).toBeGreaterThan(MAX_SEARCH_QUERY_LENGTH);
    });

    it('never leaves a lone surrogate at the end', () => {
      // The naive cut this replaces: slicing by code unit lands inside the 50th pair.
      expect(/[\uD800-\uDBFF]$/.test(emoji.slice(0, MAX_SEARCH_QUERY_LENGTH))).toBe(true);

      expect(/[\uD800-\uDBFF]$/.test(capSearchQuery(emoji))).toBe(false);
    });

    it('stays encodable', () => {
      const capped = capSearchQuery(emoji);

      expect(() => encodeURIComponent(capped)).not.toThrow();
      expect(new URLSearchParams({ query: capped }).toString()).not.toContain('%EF%BF%BD');
    });

    it('counts characters the way someone reading them would', () => {
      const capped = capSearchQuery(emoji);

      expect([...capped]).toHaveLength(MAX_SEARCH_QUERY_LENGTH);
    });
  });

  // A trailing space is part of what someone mid-sentence is typing, and the endpoint discards it
  // before measuring, so it costs nothing to keep.
  it('leaves trailing whitespace alone', () => {
    expect(capSearchQuery('spaced out  ')).toBe('spaced out  ');
  });

  // Leading whitespace is different: the endpoint drops it before searching, so letting it consume
  // the budget spends the whole query on characters that will be thrown away.
  describe('leading whitespace', () => {
    it('does not let it push the real query past the cap', () => {
      const padded = `${' '.repeat(MAX_SEARCH_QUERY_LENGTH)}football`;

      expect(capSearchQuery(padded)).toBe('football');
    });

    // What the naive version produced: a capped prefix of pure whitespace, which the endpoint reads
    // as no query at all and answers with generic top results rather than a search.
    it('never caps down to whitespace alone', () => {
      const padded = `${' '.repeat(MAX_SEARCH_QUERY_LENGTH)}football`;

      expect(padded.slice(0, MAX_SEARCH_QUERY_LENGTH).trim()).toBe('');
      expect(capSearchQuery(padded).trim()).not.toBe('');
    });

    it('drops it on a short query too, which the endpoint would have dropped anyway', () => {
      expect(capSearchQuery('   football')).toBe('football');
    });

    it('still caps what is left when the query is long in its own right', () => {
      const padded = `   ${'a'.repeat(MAX_SEARCH_QUERY_LENGTH + 50)}`;

      expect(capSearchQuery(padded)).toHaveLength(MAX_SEARCH_QUERY_LENGTH);
    });
  });

  it('stays under the limit the endpoint actually enforces', () => {
    // 400 {"error":"Invalid parameter","message":"Query must not exceed 250 characters"}
    expect(MAX_SEARCH_QUERY_LENGTH).toBeLessThan(250);
  });
});

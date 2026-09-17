import { describe, expect, it } from 'vitest';

import { decodeScores } from './use-entity-scores';

/**
 * The Score value, which does not arrive as a number (GEO-2918).
 *
 * The field is called `integer` and the schema types it as one, but the graph
 * answers with a **string** — `"15"`, not `15`. Sorting on that unconverted
 * gives lexicographic order, where `"9"` beats `"15"` and a debate with nine
 * points outranks one with fifteen. Nothing about the call site shows it.
 */
const node = (id: string, integer: number | string | null) => ({
  id,
  valuesList: integer === null ? [] : [{ integer }],
});

describe('decodeScores', () => {
  it('reads the score the graph actually sends, which is a string', () => {
    const scores = decodeScores({ entitiesConnection: { nodes: [node('a', '15'), node('b', '9')] } });

    expect(scores.get('a')).toBe(15);
    expect(scores.get('b')).toBe(9);
  });

  it('takes a number too, so a change of shape does not silently empty it', () => {
    expect(decodeScores({ entitiesConnection: { nodes: [node('a', 15)] } }).get('a')).toBe(15);
  });

  // Real: the lowest-scoring debate on the reference account sits at -1.
  it('keeps a negative score', () => {
    expect(decodeScores({ entitiesConnection: { nodes: [node('a', '-1')] } }).get('a')).toBe(-1);
  });

  it('leaves an unscored entity out rather than calling it zero', () => {
    // Zero is a real score and would rank above the -1 above. Absent has to stay
    // absent so the sort can put it last.
    const scores = decodeScores({ entitiesConnection: { nodes: [node('a', null)] } });

    expect(scores.has('a')).toBe(false);
  });

  it('ignores a value that is not a number at all', () => {
    expect(decodeScores({ entitiesConnection: { nodes: [node('a', 'not a number')] } }).has('a')).toBe(false);
  });

  it('keys on the normalised id, because callers hold the other spelling', () => {
    const scores = decodeScores({
      entitiesConnection: { nodes: [node('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '3')] },
    });

    expect(scores.get('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(3);
  });

  it('has nothing to say about an empty answer', () => {
    expect(decodeScores({}).size).toBe(0);
  });
});

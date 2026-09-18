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
    const { scores } = decodeScores({ entitiesConnection: { nodes: [node('a', '15'), node('b', '9')] } });

    expect(scores.get('a')).toBe(15);
    expect(scores.get('b')).toBe(9);
  });

  it('takes a number too, so a change of shape does not silently empty it', () => {
    expect(decodeScores({ entitiesConnection: { nodes: [node('a', 15)] } }).scores.get('a')).toBe(15);
  });

  // Real: the lowest-scoring debate on the reference account sits at -1.
  it('keeps a negative score', () => {
    expect(decodeScores({ entitiesConnection: { nodes: [node('a', '-1')] } }).scores.get('a')).toBe(-1);
  });

  it('leaves an unscored entity out rather than calling it zero', () => {
    // Zero is a real score and would rank above the -1 above. Absent has to stay
    // absent so the sort can put it last.
    const { scores } = decodeScores({ entitiesConnection: { nodes: [node('a', null)] } });

    expect(scores.has('a')).toBe(false);
  });

  it('ignores a value that is not a number at all', () => {
    expect(decodeScores({ entitiesConnection: { nodes: [node('a', 'not a number')] } }).scores.has('a')).toBe(false);
  });

  it('keys on the normalised id, because callers hold the other spelling', () => {
    const { scores } = decodeScores({
      entitiesConnection: { nodes: [node('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '3')] },
    });

    expect(scores.get('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(3);
  });

  it('has nothing to say about an empty answer', () => {
    expect(decodeScores({}).scores.size).toBe(0);
    expect(decodeScores({}).rankings.size).toBe(0);
  });
});

/**
 * The indexer's ranking score — what Best orders by.
 *
 * A column on the entity rather than a property, and read from the same request
 * as the Score above because the two are used together.
 *
 * It arrives as a numeric with 22 decimal places, which no double holds. That is
 * fine and worth stating plainly: the values that separate one claim from
 * another differ in the *fourth* decimal against a magnitude of 1.8e4 — the
 * reference account's whole record spans 17864.4 to 17901.8 — so a double has
 * eight orders of magnitude more precision than the ordering needs.
 */
describe('decodeScores: the ranking score', () => {
  const ranked = (id: string, rankingScore: string | number | null) => ({
    id,
    rankingScore,
    valuesList: [],
  });

  it('reads the long decimal the graph sends', () => {
    const { rankings } = decodeScores({
      entitiesConnection: { nodes: [ranked('a', '17901.8249581069362012000000')] },
    });

    expect(rankings.get('a')).toBeCloseTo(17901.8249581069, 8);
  });

  it('keeps two claims apart at the precision that actually separates them', () => {
    // The top two on the reference account, four decimal places apart.
    const { rankings } = decodeScores({
      entitiesConnection: {
        nodes: [ranked('a', '17901.8249581069362012000000'), ranked('b', '17901.5235160443048960000000')],
      },
    });

    expect(rankings.get('a')).toBeGreaterThan(rankings.get('b')!);
  });

  it('leaves an entity with no ranking out rather than calling it zero', () => {
    // Zero would rank it above every real score, since these are all ~1.8e4.
    expect(decodeScores({ entitiesConnection: { nodes: [ranked('a', null)] } }).rankings.has('a')).toBe(false);
  });

  it('reads both numbers from one node', () => {
    const { scores, rankings } = decodeScores({
      entitiesConnection: { nodes: [{ id: 'a', rankingScore: '17901.5', valuesList: [{ integer: '15' }] }] },
    });

    expect(scores.get('a')).toBe(15);
    expect(rankings.get('a')).toBe(17901.5);
  });

  it('keys on the normalised id, as the scores do', () => {
    const { rankings } = decodeScores({
      entitiesConnection: { nodes: [ranked('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '3')] },
    });

    expect(rankings.get('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(3);
  });
});

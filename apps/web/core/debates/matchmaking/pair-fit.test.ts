import { describe, expect, it } from 'vitest';

import {
  NO_SHARED_TIME_FACTOR,
  type PairFitItem,
  byPairFit,
  combinedFit,
  fitReasonText,
  parsePairFitItems,
} from './pair-fit';

const item = (userId: string, score: number): PairFitItem => ({
  userId,
  score,
  parts: { interest: 0, disagreement: 0, sharedClaims: 0, opposed: 0, agreed: 0, accountWeight: 1 },
  disagreeing: false,
  reason: null,
});

type Row = { id: string; matches: number };
const today = (left: Row, right: Row) => right.matches - left.matches || left.id.localeCompare(right.id);

describe('combinedFit', () => {
  it('halves the fit only when their overlap is known and empty', () => {
    expect(combinedFit(item('a', 0.8), 3)).toBe(0.8);
    expect(combinedFit(item('a', 0.8), undefined)).toBe(0.8);
    expect(combinedFit(item('a', 0.8), 0)).toBe(0.8 * NO_SHARED_TIME_FACTOR);
    expect(combinedFit(undefined, 4)).toBe(0);
  });
});

describe('byPairFit', () => {
  const rows: Row[] = [
    { id: 'a', matches: 5 },
    { id: 'b', matches: 1 },
    { id: 'c', matches: 3 },
    { id: 'd', matches: 3 },
  ];
  const fits = new Map([
    ['b', item('b', 0.9)],
    ['c', item('c', 0.5)],
    ['d', item('d', 0.5)],
  ]);
  const slots = new Map([['b', 0]]);
  const sort = (available: boolean) =>
    [...rows]
      .sort(
        byPairFit<Row>(
          { available, fitOf: row => fits.get(row.id), sharedFreeSlotsOf: row => slots.get(row.id) },
          today
        )
      )
      .map(row => row.id);

  it('orders by fit with time, breaking ties by the existing order', () => {
    // b: 0.9 halved for no shared time = 0.45; c and d tie at 0.5 and keep today's order; a was not scored.
    expect(sort(true)).toEqual(['c', 'd', 'b', 'a']);
  });

  it('is exactly the existing order when fit is unavailable', () => {
    expect(sort(false)).toEqual([...rows].sort(today).map(row => row.id));
  });
});

describe('fitReasonText', () => {
  it('speaks about debater 1, not to the reader', () => {
    expect(fitReasonText({ kind: 'disagree', claimId: 'c', name: 'Nuclear is green', text: '' }, 'Ana', 1)).toBe(
      'Disagrees with Ana on Nuclear is green'
    );
    expect(fitReasonText({ kind: 'disagree', claimId: 'c', name: null, text: '' }, 'Ana', 3)).toBe(
      'Disagrees with Ana on 3 claims'
    );
    expect(fitReasonText({ kind: 'shared_topic', topicId: 't', name: 'Energy', text: '' }, 'Ana', 0)).toBe(
      'Shares Ana’s interest in Energy'
    );
    expect(fitReasonText(null, 'Ana', 0)).toBeNull();
  });
});

describe('parsePairFitItems', () => {
  it('keeps well-formed items and refuses a body without a list', () => {
    expect(parsePairFitItems({ items: [item('a', 1), { userId: 'b' }, null] })).toEqual([item('a', 1)]);
    expect(parsePairFitItems({ error: 'x' })).toBeNull();
    expect(parsePairFitItems(null)).toBeNull();
  });
});

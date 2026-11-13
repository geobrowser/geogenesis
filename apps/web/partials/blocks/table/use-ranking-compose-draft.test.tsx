import { act, renderHook } from '@testing-library/react';

import { describe, expect, it } from 'vitest';

import { type RankingComposeSeed, rankingComposeSeed, useRankingComposeDraft } from './use-ranking-compose-draft';

const A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const C = 'cccccccccccccccccccccccccccccccc';
const D = 'dddddddddddddddddddddddddddddddd';
const E = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

describe('rankingComposeSeed', () => {
  it('prefers a handed-back draft, based on the draft itself', () => {
    const draft = { orderedEntityIds: [A, D, B], baseOrderedIds: [A, D], overtakenOrderedIds: [A, B] };
    expect(rankingComposeSeed(draft, [A, B])).toMatchObject({ ids: [A, D, B], base: [A, D, B] });
  });

  it('falls back to the published ballot, based on itself', () => {
    expect(rankingComposeSeed(null, [A, B])).toMatchObject({ ids: [A, B], base: [A, B] });
  });
});

describe('useRankingComposeDraft (GEO-3680)', () => {
  it('keeps an item the ranker added when a handed-back draft lands', () => {
    let seed: RankingComposeSeed = { ids: [A, B], base: [A, B] };
    const { result, rerender } = renderHook(() => useRankingComposeDraft(seed));

    // The ranker reopens compose within the poll window and adds E.
    act(() => result.current.setOrderedIds(ids => [...ids, E]));
    expect(result.current.orderedIds).toEqual([A, B, E]);

    // The draft lands: another device's D, plus our overtaken B.
    seed = rankingComposeSeed({ orderedEntityIds: [A, D, B], baseOrderedIds: [A, D], overtakenOrderedIds: [A, B] }, [
      A,
      B,
    ]);
    rerender();

    expect(result.current.orderedIds).toEqual([A, D, B, E]);
    expect(result.current.getBasedOnOrderedIds()).toEqual([A, D, B]);
  });

  it('takes the new seed outright when the ranker has no edits of their own', () => {
    let seed: RankingComposeSeed = { ids: [A, B], base: [A, B] };
    const { result, rerender } = renderHook(() => useRankingComposeDraft(seed));

    seed = { ids: [C, A], base: [C, A] };
    rerender();

    expect(result.current.orderedIds).toEqual([C, A]);
    expect(result.current.getBasedOnOrderedIds()).toEqual([C, A]);
  });
});

describe('grades in the draft (GEO-3729)', () => {
  const graded = (entries: Array<[string, 'A' | 'B' | 'C']>) => new Map(entries);

  it('gives a debate placed in the list the tier it lands in, and drops a removed one’s grade', () => {
    const seed: RankingComposeSeed = {
      ids: [A, B, C],
      base: [A, B, C],
      grades: graded([
        [A, 'A'],
        [B, 'B'],
        [C, 'C'],
      ]),
    };
    const { result } = renderHook(() => useRankingComposeDraft(seed));
    act(() => result.current.setOrderedIds([A, D, B, C]));
    expect(result.current.grades.get(D)).toBe('A');
    act(() => result.current.setOrderedIds([A, D, C]));
    expect(result.current.grades.has(B)).toBe(false);
  });

  it('keeps a regrade made here when another device’s publish moves the seed', () => {
    let seed: RankingComposeSeed = {
      ids: [A, B],
      base: [A, B],
      grades: graded([
        [A, 'A'],
        [B, 'B'],
      ]),
    };
    const { result, rerender } = renderHook(() => useRankingComposeDraft(seed));
    act(() =>
      result.current.setDraft(
        [A, B],
        graded([
          [A, 'A'],
          [B, 'A'],
        ])
      )
    );
    seed = {
      ids: [A, B, E],
      base: [A, B, E],
      grades: graded([
        [A, 'A'],
        [B, 'B'],
        [E, 'C'],
      ]),
    };
    rerender();
    expect(result.current.orderedIds).toEqual([A, B, E]);
    expect(result.current.grades.get(B)).toBe('A');
    expect(result.current.grades.get(E)).toBe('C');
  });
});

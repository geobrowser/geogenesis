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
    expect(rankingComposeSeed(draft, [A, B])).toEqual({ ids: [A, D, B], base: [A, D, B] });
  });

  it('falls back to the published ballot, based on itself', () => {
    expect(rankingComposeSeed(null, [A, B])).toEqual({ ids: [A, B], base: [A, B] });
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

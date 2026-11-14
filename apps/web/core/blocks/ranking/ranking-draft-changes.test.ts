import { describe, expect, it } from 'vitest';

import { countBallotChanges, unpublishedChangesLabel } from './ranking-draft-changes';

describe('countBallotChanges', () => {
  it('is zero for the same order', () => {
    expect(countBallotChanges(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(0);
  });

  it('counts each debate placed, removed or moved', () => {
    expect(countBallotChanges(['a', 'b'], ['a', 'x', 'b', 'y'])).toBe(2);
    expect(countBallotChanges(['a', 'b', 'c'], ['a', 'c'])).toBe(1);
    // One debate moved from the bottom to the top is one change, not three.
    expect(countBallotChanges(['a', 'b', 'c', 'd'], ['d', 'a', 'b', 'c'])).toBe(1);
    expect(countBallotChanges([], ['a', 'b', 'c'])).toBe(3);
  });

  it('counts an emptied ranking as one change per debate removed', () => {
    expect(countBallotChanges(['a', 'b', 'c'], [])).toBe(3);
  });

  it('labels the count', () => {
    expect(unpublishedChangesLabel(1)).toBe('1 change not published');
    expect(unpublishedChangesLabel(3)).toBe('3 changes not published');
  });
});

describe('countBallotChanges with grades (GEO-3729)', () => {
  const A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

  it('counts a regrade that kept its place as one change', () => {
    expect(
      countBallotChanges([A, B], [A, B], {
        published: new Map([[A, 'A' as const]]),
        draft: new Map([[A, 'B' as const]]),
      })
    ).toBe(1);
  });

  it('counts a regrade that moved as one change', () => {
    expect(
      countBallotChanges([A, B], [B, A], {
        published: new Map([
          [A, 'A' as const],
          [B, 'B' as const],
        ]),
        draft: new Map([
          [A, 'B' as const],
          [B, 'B' as const],
        ]),
      })
    ).toBe(1);
  });
});

describe('countBallotChanges: a move and a regrade of different debates (GEO-3729)', () => {
  const A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const C = 'cccccccccccccccccccccccccccccccc';

  it('counts two changes', () => {
    expect(
      countBallotChanges([A, B, C], [B, A, C], {
        published: new Map([[C, 'B' as const]]),
        draft: new Map([[C, 'C' as const]]),
      })
    ).toBe(2);
  });
});

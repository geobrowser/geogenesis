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

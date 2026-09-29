import { describe, expect, it } from 'vitest';

import { ACTIVITY_MAX_DEPTH, ACTIVITY_ROOT_DEPTH, canNestBelow } from './claim-activity-depth';

describe('activity depth', () => {
  // The levels the feed actually draws, named, so a change to the constant has to answer for them.
  it('draws a debate, its claims, the comments on those, and their replies', () => {
    const debate = ACTIVITY_ROOT_DEPTH;
    const extractedClaim = debate + 1;
    const commentOnClaim = extractedClaim + 1;
    const replyToThatComment = commentOnClaim + 1;

    expect(canNestBelow(debate)).toBe(true);
    expect(canNestBelow(extractedClaim)).toBe(true);
    expect(canNestBelow(commentOnClaim)).toBe(true);
    // The floor: this row's own children would be a fifth level.
    expect(canNestBelow(replyToThatComment)).toBe(false);
    expect(replyToThatComment).toBe(ACTIVITY_MAX_DEPTH);
  });

  it('never nests below the floor, however far past it a caller gets', () => {
    expect(canNestBelow(ACTIVITY_MAX_DEPTH + 1)).toBe(false);
    expect(canNestBelow(ACTIVITY_MAX_DEPTH + 10)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import { linearVoteWeight } from './ranking-vote-weights';

describe('linearVoteWeight', () => {
  it('returns 1 for a single vote', () => {
    expect(linearVoteWeight(0, 1)).toBe(1);
  });

  it('returns 1 and 0.5 for two votes', () => {
    expect(linearVoteWeight(0, 2)).toBe(1);
    expect(linearVoteWeight(1, 2)).toBe(0.5);
  });

  it('linearly interpolates between 1 and 0.5', () => {
    expect(linearVoteWeight(0, 5)).toBe(1);
    expect(linearVoteWeight(1, 5)).toBe(0.875);
    expect(linearVoteWeight(2, 5)).toBe(0.75);
    expect(linearVoteWeight(3, 5)).toBe(0.625);
    expect(linearVoteWeight(4, 5)).toBe(0.5);
  });
});

import { describe, expect, it } from 'vitest';

import { rankingVoteWeight, rankingVoteWeightFromIndex } from './ranking-vote-weights';

describe('rankingVoteWeight', () => {
  it('uses 0.5 + 0.5 / ln(k + 1) for 1-based position k', () => {
    expect(rankingVoteWeight(1)).toBeCloseTo(0.5 + 0.5 / Math.log(2));
    expect(rankingVoteWeight(2)).toBeCloseTo(0.5 + 0.5 / Math.log(3));
    expect(rankingVoteWeight(5)).toBeCloseTo(0.5 + 0.5 / Math.log(6));
  });

  it('maps zero-based indices to 1-based positions', () => {
    expect(rankingVoteWeightFromIndex(0)).toBeCloseTo(rankingVoteWeight(1));
    expect(rankingVoteWeightFromIndex(1)).toBeCloseTo(rankingVoteWeight(2));
    expect(rankingVoteWeightFromIndex(4)).toBeCloseTo(rankingVoteWeight(5));
  });

  it('assigns higher weight to earlier ranks', () => {
    expect(rankingVoteWeight(1)).toBeGreaterThan(rankingVoteWeight(2));
    expect(rankingVoteWeight(2)).toBeGreaterThan(rankingVoteWeight(3));
  });
});

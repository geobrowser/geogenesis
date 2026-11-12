import { describe, expect, it } from 'vitest';

import { buildRankingVotes, isBestDebatesBlock, rankingBallotRules } from './best-debates-ballot';
import { rankingVoteWeightFromIndex } from './ranking-vote-weights';

const BEST = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const OTHER_BLOCK = 'cccccccccccccccccccccccccccccccc';
const BLOCK_SPACE = '9284477c8fe746368698994e2e517b32';
const DEBATE_SPACE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const D1 = '11111111111111111111111111111111';
const D2 = '22222222222222222222222222222222';
const D3 = '33333333333333333333333333333333';

describe('isBestDebatesBlock', () => {
  it('is false for every block while the Best debates block id is unset', () => {
    expect(isBestDebatesBlock(BEST, null)).toBe(false);
    expect(isBestDebatesBlock(BEST)).toBe(false);
  });

  it('matches the Best debates block in any spelling, and nothing else', () => {
    expect(isBestDebatesBlock('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', BEST)).toBe(true);
    expect(isBestDebatesBlock(OTHER_BLOCK, BEST)).toBe(false);
    expect(isBestDebatesBlock('', BEST)).toBe(false);
  });
});

describe('buildRankingVotes', () => {
  const slots = [
    { id: D1, name: 'One', spaceId: DEBATE_SPACE },
    { id: D2, name: 'Two', spaceId: undefined },
    { id: D3, name: 'Three', spaceId: 'not-a-space' },
  ];

  it('keeps every other block as it was: weighted, falling back to the block space', () => {
    const rules = rankingBallotRules(OTHER_BLOCK, BEST);
    expect(rules.rankType).toBe('WEIGHTED');
    expect(buildRankingVotes(slots, rules, BLOCK_SPACE)).toEqual([
      { entityId: D1, spaceId: DEBATE_SPACE, value: rankingVoteWeightFromIndex(0) },
      { entityId: D2, spaceId: BLOCK_SPACE, value: rankingVoteWeightFromIndex(1) },
      { entityId: D3, spaceId: BLOCK_SPACE, value: rankingVoteWeightFromIndex(2) },
    ]);
  });

  it('publishes Best debates as ORDINAL, each item in its own space, with no block-space fallback', () => {
    const rules = rankingBallotRules(BEST, BEST);
    expect(rules.rankType).toBe('ORDINAL');
    const votes = buildRankingVotes(slots, rules, BLOCK_SPACE);
    expect(votes).toEqual([{ entityId: D1, spaceId: DEBATE_SPACE }]);
    expect(votes.some(vote => vote.spaceId === BLOCK_SPACE)).toBe(false);
  });

  it('keeps the order of the items it publishes', () => {
    const rules = rankingBallotRules(BEST, BEST);
    const ordered = [D3, D1, D2].map(id => ({ id, name: null, spaceId: DEBATE_SPACE }));
    expect(buildRankingVotes(ordered, rules, BLOCK_SPACE).map(vote => vote.entityId)).toEqual([D3, D1, D2]);
  });
});

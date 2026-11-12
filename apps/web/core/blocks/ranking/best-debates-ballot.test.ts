import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import { DEBATES_SPACE_ID } from './best-debates';
import { buildRankingVotes, rankTypeOf, rankTypeRewriteOps, rankingBallotRules } from './best-debates-ballot';
import { rankingVoteWeightFromIndex } from './ranking-vote-weights';

const BEST = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const OTHER_BLOCK = 'cccccccccccccccccccccccccccccccc';
const BLOCK_SPACE = DEBATES_SPACE_ID;
const DEBATE_SPACE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const D1 = '11111111111111111111111111111111';
const D2 = '22222222222222222222222222222222';
const D3 = '33333333333333333333333333333333';

describe('buildRankingVotes', () => {
  const slots = [
    { id: D1, name: 'One', spaceId: DEBATE_SPACE },
    { id: D2, name: 'Two', spaceId: undefined },
    { id: D3, name: 'Three', spaceId: 'not-a-space' },
  ];

  it('keeps every other block as it was: weighted, falling back to the block space', () => {
    const rules = rankingBallotRules(OTHER_BLOCK, BLOCK_SPACE, BEST);
    expect(rules.rankType).toBe('WEIGHTED');
    expect(buildRankingVotes(slots, rules, BLOCK_SPACE)).toEqual([
      { entityId: D1, spaceId: DEBATE_SPACE, value: rankingVoteWeightFromIndex(0) },
      { entityId: D2, spaceId: BLOCK_SPACE, value: rankingVoteWeightFromIndex(1) },
      { entityId: D3, spaceId: BLOCK_SPACE, value: rankingVoteWeightFromIndex(2) },
    ]);
  });

  it('publishes Best debates as ORDINAL, each item in its own space, with no block-space fallback', () => {
    const rules = rankingBallotRules(BEST, BLOCK_SPACE, BEST);
    expect(rules.rankType).toBe('ORDINAL');
    const votes = buildRankingVotes(slots, rules, BLOCK_SPACE);
    expect(votes).toEqual([{ entityId: D1, spaceId: DEBATE_SPACE }]);
    expect(votes.some(vote => vote.spaceId === BLOCK_SPACE)).toBe(false);
  });

  it('keeps the order of the items it publishes', () => {
    const rules = rankingBallotRules(BEST, BLOCK_SPACE, BEST);
    const ordered = [D3, D1, D2].map(id => ({ id, name: null, spaceId: DEBATE_SPACE }));
    expect(buildRankingVotes(ordered, rules, BLOCK_SPACE).map(vote => vote.entityId)).toEqual([D3, D1, D2]);
  });
});

describe('which blocks get the Best debates rules', () => {
  it('only the Best debates block in the Debates space, and nothing while its id is unset', () => {
    expect(rankingBallotRules(BEST, BLOCK_SPACE, BEST).rankType).toBe('ORDINAL');
    expect(rankingBallotRules(BEST, DEBATE_SPACE, BEST).rankType).toBe('WEIGHTED');
    expect(rankingBallotRules(BEST, BLOCK_SPACE, null).rankType).toBe('WEIGHTED');
    expect(rankingBallotRules(BEST, BLOCK_SPACE).rankType).toBe('WEIGHTED');
  });
});

describe('relabelling an existing ballot ORDINAL', () => {
  const ordinal = rankingBallotRules(BEST, BLOCK_SPACE, BEST);
  const weighted = rankingBallotRules(OTHER_BLOCK, BLOCK_SPACE, BEST);
  const rank = (type: string | null) =>
    ({
      id: '44444444444444444444444444444444',
      values: type ? [{ property: { id: SystemIds.RANK_TYPE_PROPERTY }, value: type, isDeleted: false }] : [],
    }) as never;

  it('reads the Rank type', () => {
    expect(rankTypeOf(rank('WEIGHTED'))).toBe('WEIGHTED');
    expect(rankTypeOf(rank(null))).toBeNull();
  });

  it('rewrites a WEIGHTED or unknown type to ORDINAL on Best debates', () => {
    const ops = rankTypeRewriteOps(rank('WEIGHTED'), ordinal);
    expect(ops.length).toBeGreaterThan(0);
    expect(JSON.stringify(ops, (_k, v) => (v instanceof Uint8Array ? Array.from(v) : v))).toContain('ORDINAL');
    expect(rankTypeRewriteOps(rank(null), ordinal).length).toBeGreaterThan(0);
  });

  it('leaves an ORDINAL ballot and every other block alone', () => {
    expect(rankTypeRewriteOps(rank('ORDINAL'), ordinal)).toEqual([]);
    expect(rankTypeRewriteOps(rank('WEIGHTED'), weighted)).toEqual([]);
    expect(rankTypeRewriteOps(null, ordinal)).toEqual([]);
  });
});

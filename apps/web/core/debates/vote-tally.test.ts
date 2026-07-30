import { describe, expect, it } from 'vitest';

import { type DebateVoteRecord, tallyDebateVotes, voteSharePercentages } from './vote-tally';

const ALICE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const BOB = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const VOTER_1 = '11111111111111111111111111111111';
const VOTER_2 = '22222222222222222222222222222222';
const VOTER_3 = '33333333333333333333333333333333';

const vote = (id: string, voterSpaceId: string, winnerSpaceEntityId: string): DebateVoteRecord => ({
  id,
  voterSpaceId,
  winnerSpaceEntityId,
  winnerName: winnerSpaceEntityId === ALICE ? 'Alice' : 'Bob',
});

describe('tallyDebateVotes', () => {
  it('counts one vote per debater', () => {
    const tally = tallyDebateVotes(
      [vote('v1', VOTER_1, ALICE), vote('v2', VOTER_2, ALICE), vote('v3', VOTER_3, BOB)],
      null
    );
    expect(tally.countsBySpaceEntityId.get(ALICE)).toBe(2);
    expect(tally.countsBySpaceEntityId.get(BOB)).toBe(1);
  });

  it('keeps one vote per voter, taking the latest', () => {
    const tally = tallyDebateVotes([vote('v1', VOTER_1, ALICE), vote('v2', VOTER_1, BOB)], null);
    expect(tally.votesByVoterSpaceId.size).toBe(1);
    expect(tally.countsBySpaceEntityId.get(ALICE)).toBeUndefined();
    expect(tally.countsBySpaceEntityId.get(BOB)).toBe(1);
  });

  it('finds the current user’s vote by personal space id', () => {
    const tally = tallyDebateVotes([vote('v1', VOTER_1, ALICE), vote('v2', VOTER_2, BOB)], VOTER_2);
    expect(tally.myVote?.winnerSpaceEntityId).toBe(BOB);
  });

  it('reports no vote when the user has not voted', () => {
    expect(tallyDebateVotes([vote('v1', VOTER_1, ALICE)], VOTER_2).myVote).toBeNull();
    expect(tallyDebateVotes([vote('v1', VOTER_1, ALICE)], null).myVote).toBeNull();
  });

  // The indexer returns dashed UUIDs while the app stores them dashless, so matching has
  // to be canonical or a voter would never recognize their own vote.
  it('matches ids regardless of dashes', () => {
    const dashed = '11111111-1111-1111-1111-111111111111';
    const tally = tallyDebateVotes([{ ...vote('v1', dashed, ALICE), voterSpaceId: dashed }], VOTER_1);
    expect(tally.myVote?.id).toBe('v1');
  });

  it('maps each voter to their pick for the comment badge', () => {
    const tally = tallyDebateVotes([vote('v1', VOTER_1, ALICE), vote('v2', VOTER_2, BOB)], null);
    expect(tally.votesByVoterSpaceId.get(VOTER_1)?.winnerName).toBe('Alice');
    expect(tally.votesByVoterSpaceId.get(VOTER_2)?.winnerName).toBe('Bob');
  });
});

describe('voteSharePercentages', () => {
  it('splits a clean two-way vote', () => {
    expect(voteSharePercentages([13, 7])).toEqual([65, 35]);
  });

  it('gives the only voter 100%', () => {
    expect(voteSharePercentages([1, 0])).toEqual([100, 0]);
  });

  it('always sums to 100 when shares do not divide evenly', () => {
    expect(voteSharePercentages([1, 2])).toEqual([33, 67]);
    expect(voteSharePercentages([1, 1, 1])).toEqual([34, 33, 33]);
    expect(voteSharePercentages([1, 1])).toEqual([50, 50]);
  });

  it('returns zeroes when nobody has voted', () => {
    expect(voteSharePercentages([0, 0])).toEqual([0, 0]);
  });
});

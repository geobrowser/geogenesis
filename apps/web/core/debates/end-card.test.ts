import { describe, expect, it } from 'vitest';

import { summarizeClaimResponses } from '~/core/claims/browse/claim-response-summary';

import {
  type ResponseTally,
  claimVsArguments,
  claimVsArgumentsReading,
  distinctResponders,
  poolResponses,
} from './end-card';

const tally = (positive: number, negative: number, userIds: string[] = []): ResponseTally => ({
  counts: { positive, negative },
  responders: userIds.map(userId => ({ userId, direction: 'positive' as const })),
});

const split = summarizeClaimResponses;
const names = { agreeName: 'Steve', disagreeName: 'Jonathan' };

describe('poolResponses', () => {
  it('sums the responses rather than averaging the shares', () => {
    // 1/1 and 9/1 average to 70%, but ten of the twelve people agreed — which is 83%, and is what
    // happened. A claim two people answered is not as much evidence as one ten people answered.
    expect(poolResponses([tally(1, 1), tally(9, 1)])).toMatchObject({ positive: 10, negative: 2, percent: 83 });
  });

  it('reports no share at all for a debater nobody has answered', () => {
    expect(poolResponses([tally(0, 0), tally(0, 0)])).toMatchObject({ total: 0, percent: null });
    expect(poolResponses([])).toMatchObject({ total: 0, percent: null });
  });

  it('takes the floor from the pooled total, as every other claim surface does', () => {
    expect(poolResponses([tally(4, 1), tally(3, 1)]).meetsFloor).toBe(false);
    expect(poolResponses([tally(6, 1), tally(3, 1)]).meetsFloor).toBe(true);
  });
});

describe('distinctResponders', () => {
  it('counts a person once however many of the claims they answered', () => {
    expect(distinctResponders([tally(2, 0, ['a', 'b']), tally(2, 0, ['b', 'c'])])).toEqual(['a', 'b', 'c']);
  });

  it('skips a responder with no id rather than drawing an empty face', () => {
    expect(distinctResponders([tally(1, 0, ['', 'a'])])).toEqual(['a']);
  });
});

describe('claimVsArguments', () => {
  it('puts both votes on one scale and measures the distance between them', () => {
    // The debate the design was drawn against: 62% agree with the claim; Steve (for) 44%, Jonathan
    // (against) 71%, so 44 / 115 = 38% of the agreement sits on the Agree side.
    const result = claimVsArguments({ claim: split(62, 38), agreeSide: split(44, 56), disagreeSide: split(71, 29) });

    expect(result).toEqual({
      status: 'ready',
      claimPercent: 62,
      argumentsPercent: 38,
      gap: 24,
      claimLean: 'agree',
      argumentsLean: 'disagree',
    });
  });

  it('waits while the claim or either debater has fewer than three votes', () => {
    // A gap between two shares off one or two votes is noise drawn as a finding.
    expect(claimVsArguments({ claim: split(1, 1), agreeSide: split(40, 20), disagreeSide: split(40, 20) })).toEqual({
      status: 'waiting',
    });
    expect(claimVsArguments({ claim: split(60, 40), agreeSide: split(2, 0), disagreeSide: split(40, 20) })).toEqual({
      status: 'waiting',
    });
    expect(claimVsArguments({ claim: split(60, 40), agreeSide: split(40, 20), disagreeSide: split(0, 0) })).toEqual({
      status: 'waiting',
    });
  });

  it('compares as soon as all three have three votes, well under the platform floor of ten', () => {
    // The platform is too young for three counts to each reach ten; this is the debate from the
    // preview, which would otherwise wait indefinitely.
    expect(claimVsArguments({ claim: split(3, 4), agreeSide: split(2, 1), disagreeSide: split(1, 2) })).toMatchObject({
      status: 'ready',
    });
  });

  it('puts the arguments in the middle when nobody agreed with either side', () => {
    const result = claimVsArguments({ claim: split(60, 40), agreeSide: split(0, 20), disagreeSide: split(0, 20) });
    expect(result).toMatchObject({ status: 'ready', argumentsPercent: 50, argumentsLean: 'even' });
  });
});

describe('claimVsArgumentsReading', () => {
  const read = (claim: [number, number], agreeSide: [number, number], disagreeSide: [number, number]) => {
    const result = claimVsArguments({
      claim: split(...claim),
      agreeSide: split(...agreeSide),
      disagreeSide: split(...disagreeSide),
    });
    if (result.status !== 'ready') throw new Error('expected a reading');
    return claimVsArgumentsReading(result, names);
  };

  it('says "but" when the room believes one side and was persuaded by the other', () => {
    expect(read([62, 38], [44, 56], [71, 29])).toBe(
      "Most agree with the claim, but found Jonathan's arguments against it more convincing."
    );
    expect(read([30, 70], [80, 20], [20, 80])).toBe(
      "Most disagree with the claim, but found Steve's arguments for it more convincing."
    );
  });

  it('says "and" when the two point the same way', () => {
    expect(read([70, 30], [80, 20], [20, 80])).toBe(
      "Most agree with the claim, and found Steve's arguments for it more convincing."
    );
    expect(read([30, 70], [20, 80], [80, 20])).toBe(
      "Most disagree with the claim, and found Jonathan's arguments against it more convincing."
    );
  });

  it('has something true to say about an even split on either side', () => {
    expect(read([50, 50], [80, 20], [20, 80])).toBe(
      "People are split on the claim, but found Steve's arguments for it more convincing."
    );
    expect(read([70, 30], [50, 50], [50, 50])).toBe(
      "Most agree with the claim, but found neither side's arguments more convincing."
    );
    expect(read([50, 50], [50, 50], [50, 50])).toBe(
      "People are split on the claim, and found neither side's arguments more convincing."
    );
  });
});

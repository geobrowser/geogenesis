import { describe, expect, it } from 'vitest';

import { type ResponseTally, distinctResponders, poolResponses } from './end-card';

const tally = (positive: number, negative: number, userIds: string[] = []): ResponseTally => ({
  counts: { positive, negative },
  responders: userIds.map(userId => ({ userId, direction: 'positive' as const })),
});

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

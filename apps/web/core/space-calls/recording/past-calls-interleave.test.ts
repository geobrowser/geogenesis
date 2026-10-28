import { describe, expect, it } from 'vitest';

import { pastCallSlots } from './past-calls-interleave';

describe('pastCallSlots', () => {
  it('puts the first call after card firstPosition, then one every cadence cards', () => {
    expect([...pastCallSlots(40, 3, { firstPosition: 4, cadence: 10 })]).toEqual([
      [3, 0],
      [13, 1],
      [23, 2],
    ]);
  });

  it('never trails the feed: a call goes in only after a card that is there', () => {
    expect([...pastCallSlots(14, 5, { firstPosition: 4, cadence: 10 })]).toEqual([
      [3, 0],
      [13, 1],
    ]);
    expect(pastCallSlots(3, 5, { firstPosition: 4, cadence: 10 }).size).toBe(0);
  });

  it('places nothing without calls or with a bad rule', () => {
    expect(pastCallSlots(40, 0).size).toBe(0);
    expect(pastCallSlots(40, 3, { firstPosition: 0, cadence: 10 }).size).toBe(0);
    expect(pastCallSlots(40, 3, { firstPosition: 4, cadence: 0 }).size).toBe(0);
  });

  it('depends only on how many cards there are, so a later page never moves an earlier call', () => {
    const first = pastCallSlots(20, 5);
    const more = pastCallSlots(60, 5);
    for (const [index, call] of first) expect(more.get(index)).toBe(call);
  });
});

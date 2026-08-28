import { describe, expect, it } from 'vitest';

import { sortClaimsByBest } from './claims-best-order';

// Ids here are lowercase and dash-free on purpose: `sortClaimsByBest` normalizes both sides with
// `uuidToHex`, which strips dashes *and* lowercases, so a synthetic id with either would not match
// its own map key.
const claim = (id: string) => ({ id });

describe('sortClaimsByBest', () => {
  it('puts ranked claims first, in ranking order', () => {
    const ranked = new Map([
      ['cccc', 0],
      ['aaaa', 1],
    ]);

    const sorted = sortClaimsByBest([claim('aaaa'), claim('bbbb'), claim('cccc')], ranked);

    expect(sorted.map(entry => entry.id)).toEqual(['cccc', 'aaaa', 'bbbb']);
  });

  // The ranking covers a fraction of what a debate extracts, so this is the common case, not the
  // edge one: everything unranked has to keep the order it was spoken in.
  it('keeps transcript order among claims the ranking does not cover', () => {
    const sorted = sortClaimsByBest([claim('aaaa'), claim('bbbb'), claim('cccc')], new Map());

    expect(sorted.map(entry => entry.id)).toEqual(['aaaa', 'bbbb', 'cccc']);
  });

  it('keeps transcript order behind the ranked ones rather than reshuffling them', () => {
    const sorted = sortClaimsByBest(
      [claim('aaaa'), claim('bbbb'), claim('cccc'), claim('dddd')],
      new Map([['dddd', 0]])
    );

    expect(sorted.map(entry => entry.id)).toEqual(['dddd', 'aaaa', 'bbbb', 'cccc']);
  });

  it('matches ranks given as dashed uuids against hex claim ids', () => {
    const sorted = sortClaimsByBest(
      [claim('cc31e40f74231d530f1b5d0fc1cd94d8'), claim('f3dab79cb5a3d9d1759656dd5361d1c6')],
      new Map([['f3dab79c-b5a3-d9d1-7596-56dd5361d1c6'.replace(/-/g, ''), 0]])
    );

    expect(sorted.map(entry => entry.id)).toEqual([
      'f3dab79cb5a3d9d1759656dd5361d1c6',
      'cc31e40f74231d530f1b5d0fc1cd94d8',
    ]);
  });

  it('does not mutate the list it was given', () => {
    const claims = [claim('aaaa'), claim('bbbb')];

    sortClaimsByBest(claims, new Map([['bbbb', 0]]));

    expect(claims.map(entry => entry.id)).toEqual(['aaaa', 'bbbb']);
  });
});

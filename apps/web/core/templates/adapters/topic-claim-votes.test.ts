import { describe, expect, it } from 'vitest';

import { aggregateClaimVotes, baselineVoteFor } from './topic-claim-votes';

const CLAIM = 'aaaaaaaa-0000-4000-8000-000000000001';
const SPACE_X = 'bbbbbbbb-0000-4000-8000-000000000001';
const SPACE_Y = 'cccccccc-0000-4000-8000-000000000002';
const VIEWER = 'dddddddd-0000-4000-8000-000000000003';
const OTHER = 'eeeeeeee-0000-4000-8000-000000000004';
const hex = (id: string) => id.replace(/-/g, '');

describe('topic claim votes', () => {
  // The viewer agreed in Y; someone else agreed in X. The row votes in X.
  const byClaim = aggregateClaimVotes(
    [
      { objectHex: hex(CLAIM), spaceHex: hex(SPACE_Y), userId: VIEWER, isPositive: true },
      { objectHex: hex(CLAIM), spaceHex: hex(SPACE_X), userId: OTHER, isPositive: true },
    ],
    VIEWER
  );

  it('totals every space, and still knows the viewer voted somewhere', () => {
    expect(byClaim.get(hex(CLAIM))).toMatchObject({ totalPositive: 2, totalNegative: 0, viewerVote: 'agree' });
  });

  it("gives no baseline in a space the viewer didn't vote in, so their vote elsewhere isn't subtracted", () => {
    expect(baselineVoteFor(byClaim, CLAIM, SPACE_X)).toBeNull();
  });

  it("gives the viewer's own side in the space they voted in, whatever the id spelling", () => {
    expect(baselineVoteFor(byClaim, CLAIM.toUpperCase(), SPACE_Y)).toBe('agree');
    expect(baselineVoteFor(byClaim, hex(CLAIM), hex(SPACE_Y))).toBe('agree');
  });

  it('gives no baseline before the votes load or when signed out', () => {
    expect(baselineVoteFor(undefined, CLAIM, SPACE_Y)).toBeNull();
    const signedOut = aggregateClaimVotes(
      [{ objectHex: hex(CLAIM), spaceHex: hex(SPACE_Y), userId: VIEWER, isPositive: false }],
      null
    );
    expect(baselineVoteFor(signedOut, CLAIM, SPACE_Y)).toBeNull();
  });
});

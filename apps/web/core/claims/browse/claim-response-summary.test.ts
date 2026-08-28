import { describe, expect, it } from 'vitest';

import { CLAIM_RESPONSE_FLOOR, summarizeClaimResponses } from './claim-response-summary';

describe('summarizeClaimResponses', () => {
  it('reports a percentage from the very first response', () => {
    // The floor gates the controversial tag, not the number. Gating the number hid the whole
    // verdict on any claim with fewer than ten responses, which is most of them.
    const summary = summarizeClaimResponses(1, 1);

    expect(summary.percent).toBe(50);
    expect(summary.meetsFloor).toBe(false);
  });

  it('reports no percentage for a claim nobody has responded to', () => {
    // Guards the divide-by-zero, and is the one case where the module has nothing to show.
    expect(summarizeClaimResponses(0, 0).percent).toBeNull();
  });

  it('rounds to whole percent', () => {
    expect(summarizeClaimResponses(1, 2).percent).toBe(33);
    expect(summarizeClaimResponses(2, 1).percent).toBe(67);
  });

  it('withholds the controversial tag below the floor', () => {
    // Dead even, and still not contested — one-vs-one says nothing about the claim.
    const summary = summarizeClaimResponses(1, 1);

    expect(summary.percent).toBe(50);
    expect(summary.isControversial).toBe(false);
  });

  it('applies the controversial tag once the floor is cleared', () => {
    const summary = summarizeClaimResponses(5, 5);

    expect(summary.total).toBe(CLAIM_RESPONSE_FLOOR);
    expect(summary.meetsFloor).toBe(true);
    expect(summary.isControversial).toBe(true);
  });

  it('leaves a lopsided split off the band', () => {
    expect(summarizeClaimResponses(7, 3).isControversial).toBe(false);
    expect(summarizeClaimResponses(3, 7).isControversial).toBe(false);
  });

  it('includes both edges of the band', () => {
    // 40 and 60 are inside, so a claim sitting exactly on an edge doesn't flicker out of the tag
    // when one response lands.
    expect(summarizeClaimResponses(40, 60).percent).toBe(40);
    expect(summarizeClaimResponses(40, 60).isControversial).toBe(true);
    expect(summarizeClaimResponses(60, 40).isControversial).toBe(true);

    expect(summarizeClaimResponses(39, 61).isControversial).toBe(false);
    expect(summarizeClaimResponses(61, 39).isControversial).toBe(false);
  });

  it('keeps a unanimous claim above the floor out of the band', () => {
    const summary = summarizeClaimResponses(20, 0);

    expect(summary.percent).toBe(100);
    expect(summary.isControversial).toBe(false);
  });
});

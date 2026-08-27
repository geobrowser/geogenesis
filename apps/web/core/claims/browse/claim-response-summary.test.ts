import { describe, expect, it } from 'vitest';

import { CLAIM_RESPONSE_FLOOR, summarizeClaimResponses } from './claim-response-summary';

describe('summarizeClaimResponses', () => {
  it('reports no percentage below the response floor', () => {
    const summary = summarizeClaimResponses(1, 1);

    // Not 50%. One-vs-one is arithmetically a dead heat and says nothing about the claim, which is
    // the whole reason the floor exists.
    expect(summary.percent).toBeNull();
    expect(summary.isControversial).toBe(false);
  });

  it('reports no percentage for a claim nobody has responded to', () => {
    // Guards the divide-by-zero the percentage would otherwise do on an untouched claim.
    expect(summarizeClaimResponses(0, 0).percent).toBeNull();
  });

  it('reports a percentage once the floor is cleared', () => {
    const summary = summarizeClaimResponses(7, 3);

    expect(summary.total).toBe(CLAIM_RESPONSE_FLOOR);
    expect(summary.percent).toBe(70);
  });

  it('leaves a lopsided split off the controversial band', () => {
    expect(summarizeClaimResponses(7, 3).isControversial).toBe(false);
    expect(summarizeClaimResponses(3, 7).isControversial).toBe(false);
  });

  it('marks a split inside the band as controversial', () => {
    expect(summarizeClaimResponses(5, 5).isControversial).toBe(true);
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

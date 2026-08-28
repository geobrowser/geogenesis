import { describe, expect, it } from 'vitest';

import { CLAIM_RESPONSE_FLOOR, claimSummaryTier, summarizeClaimResponses } from './claim-response-summary';

/**
 * The tier is the one rule every claim surface reads, so these pin the boundaries rather than the
 * rendering. What each tier *looks* like is a component's business; which tier a population falls
 * into is not, and a card and the claim page disagreeing about that is the failure this prevents.
 */
describe('claimSummaryTier', () => {
  it('invites where nobody has answered', () => {
    expect(claimSummaryTier(0)).toBe('invite');
  });

  it('reports a tally, not a rate, below the floor', () => {
    // The whole range, not a sampled point: this is the band almost every claim lives in — the
    // median claim has two responses — so an off-by-one here would mis-draw nearly the whole corpus.
    for (let total = 1; total < CLAIM_RESPONSE_FLOOR; total++) {
      expect(claimSummaryTier(total)).toBe('counts');
    }
  });

  it('gives the full verdict from the floor upward', () => {
    expect(claimSummaryTier(CLAIM_RESPONSE_FLOOR)).toBe('full');
    expect(claimSummaryTier(CLAIM_RESPONSE_FLOOR + 1)).toBe('full');
    expect(claimSummaryTier(500)).toBe('full');
  });

  it('treats a negative total as nothing to divide', () => {
    // The counts are optimistically adjusted and clamped elsewhere, but a tier decided from a
    // number below zero should still invite rather than fall through to a tally of nothing.
    expect(claimSummaryTier(-1)).toBe('invite');
  });

  it('withholds the rate exactly where the percentage would be least honest', () => {
    // One response is unanimous by construction, and 93% of answered claims in the corpus are
    // unanimous in fact. `percent` is still computed — the pills and the optimistic adjustment need
    // it — so the tier is the thing that has to stop it reaching the page.
    const single = summarizeClaimResponses(1, 0);
    expect(single.percent).toBe(100);
    expect(claimSummaryTier(single.total)).toBe('counts');
  });

  it('lines up with the floor the Controversial band already used', () => {
    // The band and the tier must agree, or a claim could be called controversial by one and too
    // thin to characterise by the other.
    const contested = summarizeClaimResponses(5, 5);
    expect(contested.isControversial).toBe(true);
    expect(claimSummaryTier(contested.total)).toBe('full');

    const thin = summarizeClaimResponses(2, 2);
    expect(thin.isControversial).toBe(false);
    expect(claimSummaryTier(thin.total)).toBe('counts');
  });
});

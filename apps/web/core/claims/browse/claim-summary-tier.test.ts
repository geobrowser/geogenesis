import { describe, expect, it } from 'vitest';

import { CLAIM_RESPONSE_FLOOR, claimSummaryTier, summarizeClaimResponses } from './claim-response-summary';

/**
 * The one rule every claim surface reads for whether there is a split to draw. What each state
 * *looks* like is a component's business; which state a population falls into is not, and a card
 * and the claim page disagreeing about that is the failure this prevents.
 */
describe('claimSummaryTier', () => {
  it('invites where nobody has answered', () => {
    expect(claimSummaryTier(0)).toBe('invite');
  });

  it('draws the split from the very first response', () => {
    // Deliberately including the whole 1–9 band, which is where nearly every claim lives — the
    // median has two responses. This band used to be withheld, and the withholding is the thing
    // being pinned against here: the population is stated by the responder cluster under the
    // number, so the number itself does not have to hedge.
    for (const total of [1, 2, 3, 9, CLAIM_RESPONSE_FLOOR, CLAIM_RESPONSE_FLOOR + 1, 500]) {
      expect(claimSummaryTier(total)).toBe('full');
    }
  });

  it('treats a negative total as nothing to divide', () => {
    // The counts are optimistically adjusted and clamped elsewhere, but a state decided from a
    // number below zero should still invite rather than draw a bar of nothing.
    expect(claimSummaryTier(-1)).toBe('invite');
  });

  it('keeps the floor on the Controversial band, where a population is genuinely required', () => {
    // The floor did not go away with the tally tier. Calling a 1–1 split contested describes how
    // few people have read the claim, not the claim — so the band still waits for a population even
    // though the percentage no longer does.
    const thin = summarizeClaimResponses(1, 1);
    expect(claimSummaryTier(thin.total)).toBe('full');
    expect(thin.percent).toBe(50);
    expect(thin.isControversial).toBe(false);

    const contested = summarizeClaimResponses(5, 5);
    expect(contested.isControversial).toBe(true);
  });

  it('gives a unanimous single response a real percentage', () => {
    // One response is unanimous by construction and 93% of answered claims are unanimous in fact.
    // Both are true and both are now shown; the responder cluster is what stops "100%" reading as
    // a verdict rather than a tally of one.
    const single = summarizeClaimResponses(1, 0);
    expect(single.percent).toBe(100);
    expect(claimSummaryTier(single.total)).toBe('full');
  });
});

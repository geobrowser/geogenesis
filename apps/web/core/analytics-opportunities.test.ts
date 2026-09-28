import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createRankingOpportunity } from './analytics-opportunities';

const capture = vi.hoisted(() => vi.fn());
vi.mock('./analytics', () => ({ capture }));
beforeEach(() => {
  capture.mockReset();
});
describe('ranking opportunity', () => {
  it('preserves the interaction across auth continuation and rerenders', () => {
    const opportunity = createRankingOpportunity('ranking');
    opportunity.eligibility('authentication_required', 'sign_in');
    opportunity.eligibility('authentication_required', 'sign_in');
    opportunity.eligibility('eligible', 'ready');
    expect(capture).toHaveBeenCalledTimes(2);
    expect(new Set(capture.mock.calls.map(([, p]) => p.opportunity_id)).size).toBe(1);
  });
  it('requires continuous visible exposure independently of attempts and eligibility', () => {
    const opportunity = createRankingOpportunity('ranking');
    opportunity.eligibility('ineligible', 'closed');
    opportunity.visibility(0, false);
    opportunity.visibility(1000, true);
    opportunity.visibility(1500, false);
    opportunity.visibility(2000, true);
    opportunity.visibility(2999, true);
    expect(capture).toHaveBeenCalledTimes(1);
    opportunity.visibility(3000, true);
    opportunity.visibility(5000, true);
    expect(capture).toHaveBeenCalledTimes(2);
    expect(capture.mock.calls[1][0]).toBe('feature_exposed');
    expect(capture.mock.calls.every(([name]) => name !== 'action_attempted')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';

import { EASY_DIFFICULTY_ID, HARD_DIFFICULTY_ID, MEDIUM_DIFFICULTY_ID } from './ontology';
import { formatPayoutRange, payoutRange } from './payout';

describe('payoutRange', () => {
  it('is the flat budget for easy or unspecified difficulty', () => {
    expect(payoutRange(1000, EASY_DIFFICULTY_ID)).toEqual({ min: 1000, max: 1000 });
    expect(payoutRange(1000, null)).toEqual({ min: 1000, max: 1000 });
  });

  it('is the minimum share up to the full budget for medium and hard', () => {
    expect(payoutRange(1000, MEDIUM_DIFFICULTY_ID)).toEqual({ min: 200, max: 1000 });
    expect(payoutRange(1000, HARD_DIFFICULTY_ID)).toEqual({ min: 200, max: 1000 });
  });

  it('is null without a budget', () => {
    expect(payoutRange(null, HARD_DIFFICULTY_ID)).toBeNull();
    expect(payoutRange(Number.NaN, HARD_DIFFICULTY_ID)).toBeNull();
  });
});

describe('formatPayoutRange', () => {
  it('collapses equal bounds and formats thousands', () => {
    expect(formatPayoutRange({ min: 1000, max: 1000 })).toBe('1,000');
    expect(formatPayoutRange({ min: 200, max: 1000 })).toBe('200 – 1,000');
    expect(formatPayoutRange(null)).toBeNull();
  });
});

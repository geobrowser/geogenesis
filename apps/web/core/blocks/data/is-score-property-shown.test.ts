import { describe, expect, it } from 'vitest';

import { SCORE_SYSTEM_PROPERTY } from '~/core/constants';

import { isScorePropertyShown } from './is-score-property-shown';

describe('isScorePropertyShown', () => {
  it('returns true when Score is in shown columns', () => {
    expect(isScorePropertyShown([SCORE_SYSTEM_PROPERTY])).toBe(true);
  });

  it('returns false when Score is not in shown columns', () => {
    expect(isScorePropertyShown([])).toBe(false);
  });
});

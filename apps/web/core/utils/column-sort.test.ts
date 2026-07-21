import { describe, expect, it } from 'vitest';

import { SCORE_SYSTEM_PROPERTY } from '~/core/constants';

import { shouldIncludeWithoutValueForPropertySort } from './column-sort';

describe('shouldIncludeWithoutValueForPropertySort', () => {
  it('includes entities without a value when sorting by score', () => {
    expect(shouldIncludeWithoutValueForPropertySort(SCORE_SYSTEM_PROPERTY)).toBe(true);
  });

  it('does not include missing values for other property sorts', () => {
    expect(shouldIncludeWithoutValueForPropertySort('other-property')).toBe(false);
  });
});

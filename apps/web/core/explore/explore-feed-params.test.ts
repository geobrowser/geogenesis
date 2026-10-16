import { describe, expect, it } from 'vitest';

import { parseExplorePageSort, parseExploreSort, parseExploreTime } from './explore-feed-params';

describe('Explore feed request parameters', () => {
  it('accepts known sorts and uses the caller fallback otherwise', () => {
    expect(parseExploreSort('new')).toBe('new');
    expect(parseExploreSort('invalid', 'top')).toBe('top');
    expect(parseExploreSort(null)).toBe('best');
  });

  it('accepts For you only on the Explore parser', () => {
    expect(parseExploreSort('for-you')).toBe('best');
    expect(parseExplorePageSort('for-you')).toBe('for-you');
    expect(parseExplorePageSort('top')).toBe('top');
    expect(parseExplorePageSort('invalid')).toBe('best');
  });

  it('accepts known time windows and treats everything else as all time', () => {
    expect(parseExploreTime('week')).toBe('week');
    expect(parseExploreTime('invalid')).toBe('all');
    expect(parseExploreTime(null)).toBe('all');
  });
});

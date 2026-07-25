import { describe, expect, it } from 'vitest';

import { exploreTimeThresholdSec } from './explore-time';

describe('exploreTimeThresholdSec', () => {
  const nowMs = 2_000_000_000 * 1000;

  it('uses the same rolling windows as the Explore feed', () => {
    expect(exploreTimeThresholdSec('today', nowMs)).toBe(2_000_000_000 - 86400);
    expect(exploreTimeThresholdSec('week', nowMs)).toBe(2_000_000_000 - 7 * 86400);
    expect(exploreTimeThresholdSec('month', nowMs)).toBe(2_000_000_000 - 30 * 86400);
    expect(exploreTimeThresholdSec('year', nowMs)).toBe(2_000_000_000 - 365 * 86400);
  });

  it('does not add a cutoff for all time', () => {
    expect(exploreTimeThresholdSec('all', nowMs)).toBeNull();
  });
});

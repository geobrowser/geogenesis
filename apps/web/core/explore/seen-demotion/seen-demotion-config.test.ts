import { describe, expect, it } from 'vitest';

import { readSeenDemotionPageConfig, seenDemotionPageConfig } from './seen-demotion-config';

describe('the page payload (GEO-3234)', () => {
  it('carries the knobs only while on', () => {
    expect(seenDemotionPageConfig({ enabled: true, minViews: 3, days: 2 })).toEqual({ minViews: 3, days: 2 });
    expect(seenDemotionPageConfig({ enabled: false, minViews: 3, days: 2 })).toBeNull();
    expect(seenDemotionPageConfig(undefined)).toBeNull();
  });

  it('reads a malformed payload as off and clamps one out of range', () => {
    expect(readSeenDemotionPageConfig(undefined)).toBeNull();
    expect(readSeenDemotionPageConfig({ minViews: '2', days: 3 })).toBeNull();
    expect(readSeenDemotionPageConfig({ minViews: Number.NaN, days: 3 })).toBeNull();
    expect(readSeenDemotionPageConfig({ minViews: 0, days: 40 })).toEqual({ minViews: 1, days: 7 });
  });
});

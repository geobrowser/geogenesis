import { beforeEach, describe, expect, it } from 'vitest';

import { markRematchEnded, rematchEndedSince, resetEndedRematches } from './ended-rematches';

describe('ended rematches (GEO-3342)', () => {
  beforeEach(() => resetEndedRematches());

  it('blocks activity read before the end was seen', () => {
    markRematchEnded('session-1', 2_000);
    expect(rematchEndedSince('session-1', 1_000)).toBe(true);
    expect(rematchEndedSince('session-1', 2_000)).toBe(true);
  });

  it('lets activity read after the end through', () => {
    markRematchEnded('session-1', 2_000);
    expect(rematchEndedSince('session-1', 2_001)).toBe(false);
  });

  it('knows nothing about sessions it never saw end', () => {
    markRematchEnded('session-1', 2_000);
    expect(rematchEndedSince('session-2', 1_000)).toBe(false);
  });
});

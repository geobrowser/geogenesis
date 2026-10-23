import { describe, expect, it } from 'vitest';

import { SIGNED_OUT_SPACE_CALLS_POLL_MS, signedOutSpaceCallsPoll } from './hooks';

describe('signedOutSpaceCallsPoll', () => {
  it('polls until the space is known to have no calls', () => {
    expect(signedOutSpaceCallsPoll(undefined)).toBe(SIGNED_OUT_SPACE_CALLS_POLL_MS);
    expect(signedOutSpaceCallsPoll({ space_id: 's', supported: true, viewer_can_start: null, calls: [] })).toBe(
      SIGNED_OUT_SPACE_CALLS_POLL_MS
    );
    expect(signedOutSpaceCallsPoll({ space_id: 's', supported: false, viewer_can_start: null, calls: [] })).toBe(false);
  });
});

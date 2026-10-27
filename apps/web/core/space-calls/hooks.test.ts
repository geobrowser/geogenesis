import { describe, expect, it } from 'vitest';

import { SIGNED_OUT_SPACE_CALLS_POLL_MS, signedOutSpaceCallsPoll, spaceCallsPoll } from './hooks';

describe('signedOutSpaceCallsPoll', () => {
  it('polls until the space is known to have no calls', () => {
    expect(signedOutSpaceCallsPoll(undefined)).toBe(SIGNED_OUT_SPACE_CALLS_POLL_MS);
    expect(signedOutSpaceCallsPoll({ space_id: 's', supported: true, viewer_can_start: null, calls: [] })).toBe(
      SIGNED_OUT_SPACE_CALLS_POLL_MS
    );
    expect(signedOutSpaceCallsPoll({ space_id: 's', supported: false, viewer_can_start: null, calls: [] })).toBe(false);
  });
});

describe('spaceCallsPoll', () => {
  it('polls only a live read, signed out', () => {
    expect(spaceCallsPoll({ authenticated: false, live: true }, undefined)).toBe(SIGNED_OUT_SPACE_CALLS_POLL_MS);
    expect(spaceCallsPoll({ authenticated: false, live: false }, undefined)).toBe(false);
    expect(spaceCallsPoll({ authenticated: true, live: true }, undefined)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import { PAGE_DENSITY, PANEL_DENSITY, threadSpineOffsetPx } from './comment-density';

describe('threadSpineOffsetPx', () => {
  // The invariant, stated the way the layout actually works: a nested reply list is
  // inset from its parent row by `bodyInsetPx`, so reaching back by the spine offset
  // has to land exactly on the parent avatar's centre. Asserted per density because
  // the bug was one hardcoded offset used for both.
  it.each([
    ['page', PAGE_DENSITY],
    ['panel', PANEL_DENSITY],
  ])('lands the connector on the parent avatar centre at %s density', (_label, density) => {
    expect(density.bodyInsetPx - threadSpineOffsetPx(density)).toBe(density.avatarCenterPx);
  });

  it('differs between densities, since the avatar sizes differ', () => {
    // 44 − 16 and 44 − 10. The panel value is the one that used to be wrong: it was
    // hardcoded to the page's 28, leaving every panel connector 6px off.
    expect(threadSpineOffsetPx(PAGE_DENSITY)).toBe(28);
    expect(threadSpineOffsetPx(PANEL_DENSITY)).toBe(34);
    expect(threadSpineOffsetPx(PANEL_DENSITY)).not.toBe(threadSpineOffsetPx(PAGE_DENSITY));
  });
});

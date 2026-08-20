import { describe, expect, it } from 'vitest';

import { avatarBottomInRowPx, PAGE_DENSITY, PANEL_DENSITY, threadArmCenterPx, threadSpineOffsetPx } from './comment-density';

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

describe('threadArmCenterPx', () => {
  // A connector arriving from the side has to land on the avatar's centre *within its
  // row*. On the page those are the same number, which is why the old code could use
  // half-the-avatar for both and still look right there.
  it('coincides with half the avatar on the page, where the avatar fills the row', () => {
    expect(PAGE_DENSITY.avatarPx).toBe(PAGE_DENSITY.headerMinHeightPx);
    expect(threadArmCenterPx(PAGE_DENSITY)).toBe(PAGE_DENSITY.avatarCenterPx);
  });

  it('is not half the avatar in the panel, where a 20px avatar is centred in a 32px row', () => {
    expect(PANEL_DENSITY.avatarPx).toBeLessThan(PANEL_DENSITY.headerMinHeightPx);
    // 16, not the 10 the connectors used to be drawn at — the 6px the arms sat high by.
    expect(threadArmCenterPx(PANEL_DENSITY)).toBe(16);
    expect(threadArmCenterPx(PANEL_DENSITY)).not.toBe(PANEL_DENSITY.avatarCenterPx);
  });

  it('puts the descending spine at the avatar bottom, half an avatar below the arm', () => {
    for (const density of [PAGE_DENSITY, PANEL_DENSITY]) {
      expect(avatarBottomInRowPx(density) - threadArmCenterPx(density)).toBe(density.avatarPx / 2);
    }
    expect(avatarBottomInRowPx(PAGE_DENSITY)).toBe(32);
    expect(avatarBottomInRowPx(PANEL_DENSITY)).toBe(26);
  });
});

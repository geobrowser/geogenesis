import { describe, expect, it } from 'vitest';

import { canReleaseHeldHeight } from './profile-activity-section';

/**
 * When the Activity gallery may stop holding its height (GEO-2974).
 *
 * Switching Debates to Claims swaps tall cards for short ones, which is
 * legitimate — a claim card really is shorter. What is not is doing it while
 * somebody is standing below where the page would then end. Measured on an
 * iPhone 13 against the live site: the document goes 1198 to 874 with the reader
 * 389 down it, and 874 can only scroll to 210, so the browser puts them there.
 *
 * No scroll position survives that, so the gallery holds its height instead and
 * this decides when to let go. The numbers below are that measurement.
 */
const AT_THE_BOTTOM = {
  heldHeight: 520,
  contentHeight: 254,
  documentHeight: 1198,
  viewportHeight: 664,
  scrollY: 389,
};

describe('canReleaseHeldHeight', () => {
  /**
   * The reader is 389 down a page that would end at 268 without the floor
   * (1198 - 266 padding - 664 viewport). Letting go moves them 121px.
   */
  it('holds while dropping the floor would move the reader', () => {
    expect(canReleaseHeldHeight(AT_THE_BOTTOM)).toBe(false);
  });

  it('lets go once they have scrolled up out of the way', () => {
    expect(canReleaseHeldHeight({ ...AT_THE_BOTTOM, scrollY: 120 })).toBe(true);
  });

  /**
   * The ordinary way out: the incoming content grew past the floor, so the floor
   * is adding nothing and there is nothing to lose by dropping it.
   */
  it('lets go once the content is taller than the floor', () => {
    expect(canReleaseHeldHeight({ ...AT_THE_BOTTOM, contentHeight: 600 })).toBe(true);
  });

  it('lets go when the content exactly matches the floor', () => {
    expect(canReleaseHeldHeight({ ...AT_THE_BOTTOM, contentHeight: 520 })).toBe(true);
  });

  /** The boundary itself is safe: the reader lands exactly at the new bottom. */
  it('lets go at the exact offset where nothing moves', () => {
    expect(canReleaseHeldHeight({ ...AT_THE_BOTTOM, scrollY: 268 })).toBe(true);
    expect(canReleaseHeldHeight({ ...AT_THE_BOTTOM, scrollY: 269 })).toBe(false);
  });

  /**
   * A tall enough page absorbs the loss. The reader is in the middle of a long
   * document, so 266px off the bottom is not their problem.
   */
  it('lets go on a page with room to spare below', () => {
    expect(canReleaseHeldHeight({ ...AT_THE_BOTTOM, documentHeight: 4000 })).toBe(true);
  });
});

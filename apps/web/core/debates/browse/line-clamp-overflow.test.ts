import { describe, expect, it } from 'vitest';

import { drawnLineClamp, exceedsLineClamp } from './line-clamp-overflow';

/**
 * The numbers below are measured, not invented: Chromium rendering the debate claim title at its
 * real type scale. Mobile is a 24px face on 24px leading, desktop a 22.4px face on 21px leading, and
 * in both a rendered line of glyphs is two to three pixels taller than the box holding it.
 */
const MOBILE = { lineHeight: 24, maxLines: 2 };
const DESKTOP = { lineHeight: 21, maxLines: 2 };

describe('exceedsLineClamp', () => {
  // The bug: every one of these was reported as overflowing, so the control was permanent.
  it('does not call a single line overflowing when the glyphs outgrow their line box', () => {
    expect(exceedsLineClamp({ contentHeight: 26, clampedHeight: 24, ...MOBILE })).toBe(false);
    expect(exceedsLineClamp({ contentHeight: 24, clampedHeight: 21, ...DESKTOP })).toBe(false);
  });

  it('does not call a full clamp overflowing', () => {
    expect(exceedsLineClamp({ contentHeight: 50, clampedHeight: 48, ...MOBILE })).toBe(false);
    expect(exceedsLineClamp({ contentHeight: 45, clampedHeight: 42, ...DESKTOP })).toBe(false);
  });

  it('reports the first line the clamp actually hides', () => {
    expect(exceedsLineClamp({ contentHeight: 74, clampedHeight: 48, ...MOBILE })).toBe(true);
    expect(exceedsLineClamp({ contentHeight: 66, clampedHeight: 42, ...DESKTOP })).toBe(true);
  });

  it('reports a title far past the clamp', () => {
    expect(exceedsLineClamp({ contentHeight: 386, clampedHeight: 48, ...MOBILE })).toBe(true);
  });

  // The breakpoint swaps the type scale, so the same claim is a different number of lines on each
  // side of it. Measured: sixteen words wrap to six lines at 390px and to two at 1280px, which is
  // why the line height has to be re-read on every measure rather than captured once.
  it('answers differently for the same claim at each breakpoint', () => {
    expect(exceedsLineClamp({ contentHeight: 146, clampedHeight: 48, ...MOBILE })).toBe(true);
    expect(exceedsLineClamp({ contentHeight: 45, clampedHeight: 42, ...DESKTOP })).toBe(false);
  });

  // `line-height: normal` leaves nothing to count with, and is also the case where the box is sized
  // to the glyphs — so the height comparison is accurate there rather than merely available.
  it('falls back to comparing heights when there is no line height to count', () => {
    expect(exceedsLineClamp({ contentHeight: 72, clampedHeight: 48, lineHeight: NaN, maxLines: 2 })).toBe(true);
    expect(exceedsLineClamp({ contentHeight: 48, clampedHeight: 48, lineHeight: NaN, maxLines: 2 })).toBe(false);
    expect(exceedsLineClamp({ contentHeight: 72, clampedHeight: 48, lineHeight: 0, maxLines: 2 })).toBe(true);
  });
});

/**
 * A container query can change the clamp without the component knowing (GEO-3114): the debate
 * claim card is two lines on a wide player, one on a small one, and unclamped in the small
 * player's opened list. The measurement counts against the clamp actually drawn.
 */
describe('drawnLineClamp', () => {
  const styleWith = (value: string) => {
    const element = document.createElement('span');
    element.style.setProperty('-webkit-line-clamp', value);
    return element.style;
  };
  const styleOf = (value: string) => ({ getPropertyValue: () => value }) as unknown as CSSStyleDeclaration;

  it('reads the number of lines being drawn', () => {
    expect(drawnLineClamp(styleOf('1'))).toBe(1);
    expect(drawnLineClamp(styleOf(' 2 '))).toBe(2);
  });

  // `line-clamp-none`: nothing is hidden, so nothing can be overflowing.
  it('reports an unclamped box as unclamped', () => {
    expect(drawnLineClamp(styleOf('none'))).toBe('none');
  });

  // jsdom parses no stylesheet, and a browser may not expose the property: the caller's own
  // `maxLines` stands rather than a guess.
  it('says nothing where the style carries no clamp', () => {
    expect(drawnLineClamp(styleOf(''))).toBeNull();
    expect(drawnLineClamp(styleOf('0'))).toBeNull();
    expect(drawnLineClamp(styleWith(''))).toBeNull();
  });
});

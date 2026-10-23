import { describe, expect, it } from 'vitest';

import {
  DEBATE_CARD_WIDE_WRAPS_BELOW,
  DEBATE_CARD_WRAPS_BELOW,
  debateCardColumnWidth,
} from './debate-card-column-width';

/**
 * The CSS the helper writes, worked out for a viewport height: `dvh`, `rem` and `px` become numbers
 * and `calc`/`min`/`max` become arithmetic, so the switch can be checked at the heights it happens.
 */
function widthAt(css: string, viewportHeight: number): number {
  const js = css
    .replace(/(\d+(?:\.\d+)?)dvh/g, (_, n) => String((Number(n) * viewportHeight) / 100))
    .replace(/(\d+(?:\.\d+)?)rem/g, (_, n) => String(Number(n) * 16))
    .replace(/(\d+(?:\.\d+)?)px/g, '$1')
    .replace(/calc\(/g, '(')
    .replace(/min\(/g, 'Math.min(')
    .replace(/max\(/g, 'Math.max(');
  return new Function(`return ${js};`)() as number;
}

const EXPLORE_FITS = '83dvh - 228px';
const explore = debateCardColumnWidth(EXPLORE_FITS, DEBATE_CARD_WRAPS_BELOW);

describe('debateCardColumnWidth', () => {
  it('is the plain budget wherever the card is wide enough to keep its actions beside the pills', () => {
    expect(widthAt(explore, 900)).toBeCloseTo(0.83 * 900 - 228);
    expect(widthAt(explore, 800)).toBeCloseTo(0.83 * 800 - 228);
  });

  // GEO-3454: under the wrap width the actions take a 36px row of their own, which the plain budget
  // does not hold, so the card has to be 30px narrower for the same viewport.
  it('takes the wrapped budget where the plain one would leave the card narrow enough to wrap', () => {
    const height = 700; // plain: 353px, under the 356px edge
    expect(0.83 * height - 228).toBeLessThan(DEBATE_CARD_WRAPS_BELOW);
    expect(widthAt(explore, height)).toBeCloseTo(0.83 * height - 228 - 30);
  });

  it('switches at the edge and nowhere else', () => {
    const edge = (DEBATE_CARD_WRAPS_BELOW + 228) / 0.83;
    expect(widthAt(explore, edge + 1)).toBeGreaterThanOrEqual(DEBATE_CARD_WRAPS_BELOW);
    expect(widthAt(explore, edge - 1)).toBeLessThan(DEBATE_CARD_WRAPS_BELOW - 29);
  });

  it('moves the edge out for a row that also carries the "…"', () => {
    const wide = debateCardColumnWidth(EXPLORE_FITS, DEBATE_CARD_WIDE_WRAPS_BELOW);
    const height = 750; // plain: 394.5px — fine for comments and share, not with the "…" too
    expect(widthAt(explore, height)).toBeCloseTo(0.83 * height - 228);
    expect(widthAt(wide, height)).toBeCloseTo(0.83 * height - 228 - 30);
  });
});

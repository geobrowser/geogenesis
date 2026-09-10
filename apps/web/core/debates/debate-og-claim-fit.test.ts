import { describe, expect, it } from 'vitest';

import { measureTextWidth } from '~/core/blocks/ranking/ranking-og-image';

import { CLAIM_BAND_HEIGHT_PX, CLAIM_MEASURE_PX, balanceLines, claimLineHeight, fitClaimToBand } from './debate-og-claim-fit';

const SHORT_CLAIM = 'Waking up early improves health and productivity';
const LONG_CLAIM = 'Crypto will become the primary way people transfer money across borders within the next decade';

/** Words of average length, so a character count maps to a realistic claim. */
function claimOfLength(chars: number): string {
  const word = 'debate ';
  return word
    .repeat(Math.ceil(chars / word.length))
    .slice(0, chars)
    .trim();
}

describe('fitClaimToBand', () => {
  it('puts the short artboard claim on the top rung', () => {
    const fit = fitClaimToBand(SHORT_CLAIM);

    expect(fit.lines.length).toBeLessThanOrEqual(2);
    expect(fit.fontSize).toBeGreaterThan(40);
    expect(fit.fontSize).toBeLessThanOrEqual(64);
  });

  it('steps the long artboard claim down but keeps it on two lines', () => {
    const fit = fitClaimToBand(LONG_CLAIM);

    expect(fit.lines.length).toBeLessThanOrEqual(2);
    expect(fit.fontSize).toBeLessThan(fitClaimToBand(SHORT_CLAIM).fontSize);
  });

  /**
   * The reason the rungs chain instead of each starting at 64. Without that, a claim can render
   * *larger* than a shorter one because it happens to find a two-line fit the shorter one misses —
   * which looks like a rendering bug and is very hard to reproduce deliberately.
   */
  it('never renders a longer claim larger than a shorter one', () => {
    let previous = Infinity;

    for (let chars = 30; chars <= 210; chars += 2) {
      const { fontSize } = fitClaimToBand(claimOfLength(chars));
      expect(fontSize).toBeLessThanOrEqual(previous);
      previous = fontSize;
    }
  });

  it('never overflows the claim band', () => {
    for (let chars = 10; chars <= 400; chars += 7) {
      const fit = fitClaimToBand(claimOfLength(chars));
      const height = fit.lines.length * claimLineHeight(fit.fontSize);
      expect(height).toBeLessThanOrEqual(CLAIM_BAND_HEIGHT_PX);
    }
  });

  it('floors at 28px rather than shrinking indefinitely', () => {
    const fit = fitClaimToBand(claimOfLength(600));

    expect(fit.fontSize).toBe(28);
    expect(fit.lines.length).toBeLessThanOrEqual(4);
  });

  it('falls back rather than rendering an empty band', () => {
    expect(fitClaimToBand('   ', 'Untitled claim').lines.join(' ')).toContain('Untitled');
  });
});

describe('balanceLines', () => {
  /// Greedy wrapping fills the first line to the brim and leaves a stub, which is what the design's
  /// `text-wrap: balance` exists to avoid. This is the artboard's own break.
  it('breaks the short artboard claim the way the design does', () => {
    const { lines } = fitClaimToBand(SHORT_CLAIM);

    expect(lines).toEqual(['Waking up early improves', 'health and productivity']);
  });

  it('keeps every word, in order', () => {
    for (let chars = 20; chars <= 200; chars += 6) {
      const claim = claimOfLength(chars);
      const { fontSize, lines } = fitClaimToBand(claim);

      expect(balanceLines(claim, fontSize, lines.length).join(' ')).toBe(claim);
    }
  });

  it('never adds a line, and never widens the longest one', () => {
    for (let chars = 20; chars <= 200; chars += 6) {
      const claim = claimOfLength(chars);
      const { fontSize, lines } = fitClaimToBand(claim);
      const balanced = balanceLines(claim, fontSize, lines.length);
      const widest = (candidate: string[]) => Math.max(...candidate.map(line => measureTextWidth(line, fontSize)));

      expect(balanced.length).toBeLessThanOrEqual(lines.length);
      expect(widest(balanced)).toBeLessThanOrEqual(widest(lines));
      expect(widest(balanced)).toBeLessThanOrEqual(CLAIM_MEASURE_PX);
    }
  });

  /// The floor rung ends its last line with an ellipsis measured to a specific width. Rewrapping
  /// would move the break out from under it, so balancing has to leave that case alone.
  it('leaves the truncated floor alone', () => {
    const fit = fitClaimToBand(claimOfLength(600));

    expect(fit.fontSize).toBe(28);
    expect(fit.lines[fit.lines.length - 1]).toMatch(/\.\.\.$/);
  });
});

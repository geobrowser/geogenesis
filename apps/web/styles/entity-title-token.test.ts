import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

/**
 * The sizes GEO-2460 actually asks for, in CSS px.
 *
 * jsdom applies no stylesheet, so the component tests can only assert that the markup reaches for
 * `text-entityTitle` — deleting the token, or both narrow-viewport steps, leaves every one of them
 * green. This reads the stylesheet itself so the numbers are pinned somewhere.
 *
 * `styles.css` sets no `html { font-size }`, so 1rem is the browser default 16px.
 */
const ROOT_FONT_SIZE_PX = 16;

const SPEC = {
  /** >= 768px */
  desktop: { fontSize: 44, lineHeight: 46, maxWidth: null },
  /** 410-767px */
  tablet: { fontSize: 36, lineHeight: 38, maxWidth: 767 },
  /** <= 409px */
  phone: { fontSize: 26, lineHeight: 30, maxWidth: 409 },
} as const;

const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');

const rem = (value: string) => Number.parseFloat(value) * ROOT_FONT_SIZE_PX;

/**
 * The last declaration of `prop` at or before `fromIndex`. Later declarations win in the cascade
 * here — the media blocks are unlayered and the base token sits in `@theme` — so reading the last
 * one inside each block is what the browser resolves.
 */
function declaredValue(prop: string, block: string): number | null {
  const matches = [...block.matchAll(new RegExp(`--${prop}\\s*:\\s*([0-9.]+)rem`, 'g'))];
  const last = matches.at(-1);
  return last ? rem(last[1]) : null;
}

/** The `@media (max-width: <px>)` block's body, or the whole file for the base declaration. */
function mediaBlock(maxWidth: number | null): string {
  if (maxWidth === null) return css.slice(0, css.indexOf('@media'));

  const start = css.search(new RegExp(`@media\\s*\\(max-width:\\s*${maxWidth}px\\)`));
  expect(start, `no @media (max-width: ${maxWidth}px) block in styles.css`).toBeGreaterThan(-1);
  // Far enough to cover the nested `:root { ... }` and no further.
  return css.slice(start, css.indexOf('}\n}', start));
}

describe('entityTitle token', () => {
  it.each(Object.entries(SPEC))('renders the %s step at the size GEO-2460 specifies', (_name, step) => {
    const block = mediaBlock(step.maxWidth);

    expect(declaredValue('text-entityTitle', block)).toBe(step.fontSize);
    expect(declaredValue('text-entityTitle--line-height', block)).toBe(step.lineHeight);
  });

  // Off-by-one here is invisible in a browser until someone holds a window at exactly 767px.
  // Tailwind v4 compiles arbitrary `max-[Npx]:` variants to a strict `<`, which is what made the
  // earlier inline-class version land 767 and 409 in the wrong band; plain `max-width` is inclusive.
  it('uses inclusive boundaries, so 767 and 409 fall in the smaller band', () => {
    expect(css).toMatch(/@media\s*\(max-width:\s*767px\)/);
    expect(css).toMatch(/@media\s*\(max-width:\s*409px\)/);
    expect(css).not.toMatch(/@media\s*\(max-width:\s*(768|410)px\)/);
  });

  /**
   * Entity titles and section headings are different sizes on purpose (44 vs 52). Redefining
   * `mainPage` in a media query instead would have scaled Governance, Import data, Export Wallet
   * and the proposal hero titles along with them.
   */
  it('leaves the mainPage token flat at every width', () => {
    for (const maxWidth of [767, 409]) {
      expect(declaredValue('text-mainPage', mediaBlock(maxWidth))).toBeNull();
    }

    expect(declaredValue('text-mainPage', mediaBlock(null))).toBe(52);
  });
});

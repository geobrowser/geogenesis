import { type WrappedTextFit, fitWrappedText, measureTextWidth, wrapTextToLines } from '~/core/blocks/ranking/ranking-og-image';

/** Claim band geometry, from the design (GEO-2755). */
export const CLAIM_MEASURE_PX = 1136;
export const CLAIM_BAND_HEIGHT_PX = 210;

/** `round(size * 1.05)`, as the design specifies. */
export const claimLineHeight = (fontSize: number) => Math.round(fontSize * 1.05);

/**
 * The size ladder for the claim, largest rung first.
 *
 * Each rung *starts where the previous one bottomed out*, and that is the whole point rather than a
 * detail. The obvious "try two lines from 64, else try three lines from 64" version is not
 * monotonic: a ~104-character claim would render at 62px while a ~101-character one renders at
 * 40px, because the longer claim finds a two-line fit the shorter one just misses. Chaining the
 * ranges means size never increases as the claim gets longer.
 */
const RUNGS = [
  { maxLines: 2, from: 64, to: 40 },
  { maxLines: 3, from: 40, to: 32 },
  { maxLines: 4, from: 32, to: 28 },
] as const;

/** Below the last rung the claim is truncated rather than shrunk further. */
const FLOOR_PX = 28;
const FLOOR_MAX_LINES = 4;

/** Collapsed for comparison: the fitter normalises whitespace, so raw equality would misreport. */
const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Whether the fitter dropped content to make the claim fit, rather than finding a real fit. */
function isTruncated(claim: string, fit: WrappedTextFit): boolean {
  return collapse(fit.lines.join(' ')) !== collapse(claim);
}

/**
 * Even out the line lengths without changing the size or the number of lines.
 *
 * The design asks for balanced lines and Satori has no `text-wrap: balance`, so this does what that
 * property does: narrow the measure until one more step would cost an extra line, then wrap at that
 * width. Greedy wrapping fills each line to the brim, which on the short artboard claim gives
 * "Waking up early improves health / and productivity" — a full line over a stub. The same words at
 * a narrower measure break as "Waking up early improves / health and productivity", which is the
 * artboard.
 *
 * Binary search rather than stepping down a pixel at a time: the wrap is monotonic in the measure,
 * and the claim band is 1136px wide.
 *
 * Only ever called on a fit that was not truncated. The floor rung ends its last line with an
 * ellipsis sized to a specific width, and rewrapping would move the break out from under it.
 */
export function balanceLines(claim: string, fontSize: number, lineCount: number): string[] {
  let narrowest = wrapTextToLines(claim, fontSize, CLAIM_MEASURE_PX);
  let low = 1;
  let high = CLAIM_MEASURE_PX;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const lines = wrapTextToLines(claim, fontSize, middle);
    if (lines.length <= lineCount) {
      narrowest = lines;
      high = middle;
    } else {
      low = middle + 1;
    }
  }

  // A single word longer than the measure is pushed onto its line whole, so the search can land on
  // a set whose longest line is wider than the band. Keep the greedy wrap in that case.
  const fits = narrowest.every(line => measureTextWidth(line, fontSize) <= CLAIM_MEASURE_PX);
  return fits ? narrowest : wrapTextToLines(claim, fontSize, CLAIM_MEASURE_PX);
}

/**
 * Pick the largest size at which the claim fits the band.
 *
 * Delegates the actual wrapping and measuring to `fitWrappedText`, which already implements exactly
 * this search — the ladder is the only thing layered on top. Reusing it also means the measurement
 * matches what the ranking card renders with, rather than a second estimator that can drift.
 */
export function fitClaimToBand(claim: string, fallback = 'Untitled claim'): WrappedTextFit {
  for (const rung of RUNGS) {
    const fit = fitWrappedText(claim, rung.from, rung.to, CLAIM_MEASURE_PX, rung.maxLines, fallback, {
      maxHeight: CLAIM_BAND_HEIGHT_PX,
      lineHeight: claimLineHeight(rung.from) / rung.from,
    });
    // `fitWrappedText` never fails — when nothing fits it truncates at its own minimum and returns
    // that. Size and line count cannot tell the two apart: a 600-character claim comes back as two
    // truncated lines at 40px, which passes every geometric check while having silently dropped
    // most of the claim. Whether any text was lost is the only honest discriminator.
    const height = fit.lines.length * claimLineHeight(fit.fontSize);
    const fitsGeometry = fit.lines.length <= rung.maxLines && height <= CLAIM_BAND_HEIGHT_PX && fit.fontSize >= rung.to;
    if (fitsGeometry && !isTruncated(claim, fit)) {
      return { fontSize: fit.fontSize, lines: balanceLines(claim, fit.fontSize, fit.lines.length) };
    }
  }

  return fitWrappedText(claim, FLOOR_PX, FLOOR_PX, CLAIM_MEASURE_PX, FLOOR_MAX_LINES, fallback, {
    maxHeight: CLAIM_BAND_HEIGHT_PX,
    lineHeight: claimLineHeight(FLOOR_PX) / FLOOR_PX,
  });
}

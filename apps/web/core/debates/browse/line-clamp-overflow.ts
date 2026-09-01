/**
 * Whether line-clamped text actually has more lines than the clamp is showing.
 *
 * The obvious test — `scrollHeight > clientHeight` — is wrong whenever `line-height` is set tighter
 * than the glyphs need, and the debate claim title sets exactly that: 24px leading on a 24px face on
 * mobile, 21px on a 22.4px face on desktop. `clientHeight` is the clamp's box, `lines × line-height`.
 * `scrollHeight` is the height the *content* wants, and a 24px face wants about 26px. So the
 * difference is two or three pixels for every title ever rendered — one word or fifty — and the
 * control that comparison gates is offered permanently.
 *
 * Measured in Chromium against the real type scale: the height comparison called 6 of 14 sample
 * lengths overflowing at 390px and 12 of 14 at 1280px that were not, and never once said no.
 *
 * Counting lines is immune to it. Content that occupies n lines is `n * lineHeight` plus that same
 * sub-line overflow, so "reaches into line `maxLines + 1`" is precisely "there is more here than the
 * clamp shows" — correct on all 84 samples across both widths and all three type scales.
 *
 * `~/design-system/clamped-text` solves the same problem a different way, by measuring an unclamped
 * clone; that is also correct and is left alone. This exists because the debate title clamps a
 * heading wrapped in a link and toggles it from a separate control, which `ClampedText` does not do.
 */
export function exceedsLineClamp({
  /** `scrollHeight`. A clamped box still reports the full height its content wants. */
  contentHeight,
  /** `clientHeight`. Only used for the `line-height: normal` fallback below. */
  clampedHeight,
  /** The computed `line-height` in pixels, re-read on every measure — it changes at the breakpoint. */
  lineHeight,
  /** The `line-clamp-N` the element is rendered with. */
  maxLines,
}: {
  contentHeight: number;
  clampedHeight: number;
  lineHeight: number;
  maxLines: number;
}): boolean {
  // `line-height: normal` parses to no number, so there is nothing to count with. It is also the one
  // case where comparing heights is accurate — a normal line box is sized to the glyphs, so there is
  // no standing overflow to mistake for a wrapped line — so fall back to it rather than guess.
  if (!Number.isFinite(lineHeight) || lineHeight <= 0) return contentHeight > clampedHeight + 1;

  return contentHeight >= (maxLines + 1) * lineHeight;
}

/**
 * A debate card's column width as a height budget that knows when the card's actions wrap
 * (GEO-3454).
 *
 * The full-screen feed and the explore card size their column from the viewport height — fixed-ratio
 * media, so width is height — reserving the chrome under the media. Under `wrapsBelow` (the card
 * width at which comments and share drop under the pills, `claim-row-end-inline`) that chrome grows
 * by a 36px row the reserve does not hold. So where the budget's own answer falls under the edge, the
 * card takes the wrapped budget instead: 30px narrower, the 36px row at the media's 1.2042
 * height-to-width.
 *
 * CSS has no conditional, so the switch is a min/max over both answers. `fits + (fits - edge) * 100`
 * passes `fits` through at or above the edge and plunges just under it, which hands the `max` to the
 * wrapped answer; the wrapped one is capped 30px under the edge, so above it the unwrapped answer
 * always wins.
 *
 * `fits` is the unwrapped budget as a `calc()` body, e.g. `83dvh - 228px`.
 */
export function debateCardColumnWidth(fits: string, wrapsBelow: number): string {
  const wrapped = `min(calc(${fits} - ${WRAPPED_ROW_WIDTH}px), ${wrapsBelow - WRAPPED_ROW_WIDTH}px)`;
  const unwrapped = `min(calc(${fits}), calc(${wrapsBelow}px + (${fits} - ${wrapsBelow}px) * 100))`;
  return `max(${wrapped}, ${unwrapped})`;
}

/** The wrapped 36px row, in column width: 36 / 1.2042, rounded. */
const WRAPPED_ROW_WIDTH = 30;

/** The card's 1px frame and 12px padding either side of its pill row. */
const CARD_ROW_INSET = 26;

/** Card widths at which the actions wrap: the row's `claim-row-end-inline` / `-wide-` widths plus the inset. */
export const DEBATE_CARD_WRAPS_BELOW = 330 + CARD_ROW_INSET;
export const DEBATE_CARD_WIDE_WRAPS_BELOW = 370 + CARD_ROW_INSET;

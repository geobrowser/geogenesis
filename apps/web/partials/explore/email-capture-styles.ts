/**
 * The capture card's two shared type styles.
 *
 * They live here rather than in the popup because the account step needs them too, and importing
 * them from the popup made a cycle: the popup imports `AccountStep`, and the step imported these
 * back. It happened to work — the constants are read at render time, not at module evaluation — but
 * it is the kind of thing that works until an import order changes. It also meant any suite that
 * mocks `./email-capture-popup` left these `undefined` for a step rendered under it.
 */

/**
 * Sized for the card at both widths. The trimmed leading is the design's, and only holds on one
 * line — the narrow-screen override gives a wrapped heading room its own glyphs would otherwise sit
 * inside.
 */
export const HEADING_CLASS =
  'text-[24px] leading-[15px] font-medium tracking-[-0.72px] text-[#151515] sm:text-[26px] sm:leading-[16px] sm:tracking-[-0.78px] sm:max-[319px]:leading-[28px]';

/** 14px on both layouts, the desktop frame's size. The mobile frame sets it at 16px; it was matched to desktop on request. */
export const SUBTEXT_CLASS = 'mt-2 text-[14px] leading-[17px] tracking-[-0.42px] text-[rgba(21,21,21,0.7)]';

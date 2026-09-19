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

/**
 * 14px on desktop, the frame's size. 16px on the phone, which is what the mobile frame asked for
 * before it was matched down to desktop — at arm's length on a small screen the two are not the
 * same reading experience, and this is the line doing the persuading.
 */
export const SUBTEXT_CLASS =
  'mt-2 text-[14px] leading-[17px] tracking-[-0.42px] text-[rgba(21,21,21,0.7)] sm:text-[16px] sm:leading-[20px] sm:tracking-[-0.48px]';

/**
 * The shared geometry for the card's inputs and buttons.
 *
 * 28px is the desktop frame's height and it is fine with a cursor. On a phone it is a 28px touch
 * target, against 44pt in Apple's guidance and 48dp in Material — small enough to be missed, and
 * the reason the controls felt cramped. 44px on the phone, the desktop frame untouched.
 *
 * One definition because the popup and the account step each draw their own row, and they have
 * already drifted apart once.
 */
export const CONTROL_HEIGHT_CLASS = 'h-7 sm:h-11';

/** Button label: the frame's 16px, up a point on the phone where the control grew around it. */
export const CONTROL_LABEL_CLASS = 'text-[16px] leading-none tracking-[-0.35px] sm:text-[17px]';

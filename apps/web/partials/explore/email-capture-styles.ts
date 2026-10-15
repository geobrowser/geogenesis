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
  'text-[24px] leading-[15px] font-medium tracking-[-0.72px] text-[#151515] mobile:text-[26px] mobile:leading-[16px] mobile:tracking-[-0.78px] mobile:max-[319px]:leading-[28px]';

/**
 * 14px on desktop, the frame's size. 16px on the phone, which is what the mobile frame asked for
 * before it was matched down to desktop — at arm's length on a small screen the two are not the
 * same reading experience, and this is the line doing the persuading.
 */
export const SUBTEXT_CLASS =
  'mt-2 text-[14px] leading-[17px] tracking-[-0.42px] text-[rgba(21,21,21,0.7)] mobile:text-[16px] mobile:leading-[20px] mobile:tracking-[-0.48px]';

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
export const CONTROL_HEIGHT_CLASS = 'h-7 mobile:h-11';

/** Button label: the frame's 16px, up a point on the phone where the control grew around it. */
export const CONTROL_LABEL_CLASS = 'text-[16px] leading-none tracking-[-0.35px] mobile:text-[17px]';

/**
 * The card itself: a 308px corner card on desktop, a full-width sheet on the phone's bottom edge.
 * Shared with the save-votes sheet, which is this card with other content (GEO-3214).
 *
 * `z-1101` is one above the chat launcher's `z-1100`, which shares this corner. Rises 5px into place
 * as it fades in each time it mounts; with reduced motion it only fades.
 */
export const CARD_CLASS =
  'fixed right-4 bottom-4 z-1101 w-[308px] animate-rise-in overflow-clip rounded-xl border border-grey-02 bg-white shadow-lg motion-reduce:animate-fade-in mobile:inset-x-0 mobile:bottom-0 mobile:w-auto mobile:rounded-none mobile:rounded-t-xl mobile:shadow-none';

/**
 * The 12px close glyph, 11px in from the top-right corner, padded to a 20px target (a touch-sized
 * one on the phone sheet). `grey-04` on white, `text` on the phone, for 3:1 against what is behind it.
 */
export const CLOSE_BUTTON_CLASS =
  'absolute top-[7px] right-[7px] z-20 p-1 text-grey-04 transition-colors duration-200 ease-in-out hover:text-text mobile:top-[-5px] mobile:right-[-5px] mobile:p-4 mobile:text-text';

/** The column a field and its button sit in, the same width in every state of the card. */
export const FORM_STACK_CLASS = 'mt-[19px] flex flex-col gap-[6px] mobile:mx-auto mobile:mt-5 mobile:max-w-[394px]';

/** A pill text field. Red-bordered while what is in it was rejected. */
export function fieldClass(invalid: boolean) {
  return `${CONTROL_HEIGHT_CLASS} w-full min-w-0 rounded-full border bg-white px-3 text-[17px] leading-[19px] text-text outline-hidden transition-colors disabled:text-grey-03 ${
    invalid ? 'border-red-01' : 'border-grey-02 focus:border-text'
  }`;
}

/** The dark, full-width pill: the card's one primary action in each state. */
export const PRIMARY_BUTTON_CLASS = `inline-flex ${CONTROL_HEIGHT_CLASS} ${CONTROL_LABEL_CLASS} w-full items-center justify-center rounded-full bg-[#151515] px-2.5 whitespace-nowrap text-white transition-opacity hover:opacity-90 disabled:opacity-60`;

/** The outlined pill beside it, for the equal-weight alternative. */
export const SECONDARY_BUTTON_CLASS = `inline-flex ${CONTROL_HEIGHT_CLASS} ${CONTROL_LABEL_CLASS} w-full items-center justify-center rounded-full border border-grey-02 px-2.5 whitespace-nowrap text-[rgba(21,21,21,0.7)] transition-colors hover:border-text hover:text-text`;

/** A line under the form saying what went wrong. */
export const ERROR_CLASS = 'mt-2 text-[14px] tracking-[-0.35px] text-red-01';

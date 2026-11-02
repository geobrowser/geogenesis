import cx from 'classnames';

import type { AccountStepClasses } from '~/partials/explore/email-capture-account-step';
import { SUBTEXT_CLASS } from '~/partials/explore/email-capture-styles';

/**
 * The save-votes sheet's own look (GEO-3439), drawn after Privy's sign-in screens: pill fields and
 * buttons in place of the email capture's 28px ones (44px centred, 40px in the corner card, 48px on a
 * phone), a back and close row, and a mail badge on the code step. The heading and subtext are the email capture's own (`email-capture-styles`).
 *
 * `compact` is the corner card, a step smaller than the centred dialog. Both are the same bottom
 * sheet on a phone (`mobile:`, at most 639px), with touch-sized controls.
 */

const SURFACE_CLASS =
  'animate-rise-in overflow-clip rounded-xl border border-grey-02 bg-white shadow-[0_12px_32px_rgba(21,21,21,0.12)] motion-reduce:animate-fade-in mobile:rounded-none mobile:rounded-t-[20px] mobile:border-x-0 mobile:border-b-0 mobile:shadow-none';

/** `z-1101` is one above the chat launcher's `z-1100`, which shares this corner. */
export const CORNER_CARD_CLASS = `${SURFACE_CLASS} fixed right-4 bottom-4 z-1101 w-[320px] mobile:inset-x-0 mobile:bottom-0 mobile:w-auto`;

/** Positioned by the full-screen layer it sits in, so it carries no offsets of its own. */
export const CENTERED_CARD_CLASS = `${SURFACE_CLASS} relative w-[360px] max-w-full mobile:w-full`;

export const bodyClass = (compact: boolean) =>
  cx(
    'text-center mobile:px-5 mobile:pt-2 mobile:pb-[max(34px,env(safe-area-inset-bottom))]',
    compact ? 'px-5 pt-3 pb-5' : 'px-6 pt-3.5 pb-[22px]'
  );

/** The row the back and close buttons sit in, pulled out so their glyphs line up with the text. */
export const TOP_BAR_CLASS = '-mx-2 flex h-7 items-center justify-between mobile:-mx-3 mobile:h-11';

/** 28px round targets on desktop, 44px on the phone sheet, where they are also darker for contrast. */
export const ICON_BUTTON_CLASS =
  'flex size-7 items-center justify-center rounded-full text-grey-04 transition-colors hover:bg-grey-01 hover:text-text mobile:size-11 mobile:text-text';

/** The code step's mail badge, above its heading. */
export const badgeClass = (compact: boolean) =>
  cx(
    'mx-auto flex items-center justify-center rounded-full bg-grey-01 text-[#151515] mobile:-mt-2 mobile:mb-3.5 mobile:size-12',
    compact ? '-mt-1 mb-2.5 size-10' : 'mb-3.5 size-12'
  );

/** The vote chips as the sheet first drew them (GEO-3214). */
export const CHIP_CLASS =
  'flex items-center rounded-full border border-grey-02 bg-grey-01 px-2 py-[3px] text-[12px] leading-[14px] text-text';

export const CHIP_LIST_CLASS = 'mt-[14px] flex flex-col items-center gap-1';

/** One row of chips. It never wraps: the chips shrink, so a "+N" stays on the row it closes. */
export const CHIP_ROW_CLASS = 'flex max-w-full min-w-0 justify-center gap-1';

/** A field with the mail glyph inside it. */
export const fieldClass = (compact: boolean) =>
  cx(
    'flex w-full items-center gap-2.5 rounded-full border border-grey-02 bg-white px-4 text-grey-04 transition-colors focus-within:border-text focus-within:ring-1 focus-within:ring-text mobile:mx-auto mobile:mt-5 mobile:h-12 mobile:max-w-[394px]',
    compact ? 'mt-4 h-10' : 'mt-5 h-11'
  );

/** 16px so a phone does not zoom in on focus. */
export const INPUT_CLASS =
  'h-full min-w-0 flex-1 bg-transparent text-[16px] text-text outline-hidden placeholder:text-grey-03';

export const primaryButtonClass = (compact: boolean) =>
  cx(
    'mt-2 inline-flex w-full items-center justify-center rounded-full bg-[#151515] text-[16px] font-medium whitespace-nowrap text-white transition-opacity hover:opacity-90 disabled:opacity-50 mobile:mx-auto mobile:flex mobile:h-12 mobile:max-w-[394px] mobile:text-[17px]',
    compact ? 'h-10' : 'h-11'
  );

export const fineClass = (compact: boolean) =>
  cx('text-[12px] leading-[16px] text-grey-04 mobile:mt-3 mobile:text-[13px]', compact ? 'mt-2.5' : 'mt-3');

/** `red-01` is under 4.5:1 on white at this size; this is the same red, dark enough to read. */
const ERROR_TEXT_CLASS = 'text-[13px] leading-[18px] text-[#d92d14] mobile:text-[15px] mobile:leading-[20px]';

/**
 * The code step (`AccountStep`) in this sheet's look: the email capture's subtext, a larger box per
 * digit, a readable red, and touch-sized links on the phone.
 */
export const codeStepClasses = (compact: boolean): AccountStepClasses => ({
  subtext: SUBTEXT_CLASS,
  address:
    'mt-0.5 flex flex-wrap items-baseline justify-center gap-x-1.5 text-[14px] leading-[17px] font-medium tracking-[-0.42px] break-all text-[#151515] mobile:text-[16px] mobile:leading-[20px] mobile:tracking-[-0.48px]',
  change:
    'font-normal break-normal text-grey-04 underline underline-offset-2 transition-colors hover:text-text mobile:-my-3 mobile:py-3',
  stack: cx('mobile:mx-auto mobile:mt-[22px] mobile:max-w-[394px]', compact ? 'mt-4' : 'mt-5'),
  box: cx(
    'mobile:h-14 mobile:max-w-[48px] mobile:rounded-lg mobile:text-[24px]',
    compact ? 'h-12 max-w-[40px] rounded-[10px] text-[20px]' : 'h-[52px] max-w-[44px] rounded-[10px] text-[22px]'
  ),
  note: cx(
    'text-[13px] leading-[18px] text-grey-04 mobile:mt-[18px] mobile:text-[15px] mobile:leading-[20px]',
    compact ? 'mt-3.5' : 'mt-4'
  ),
  error: `mt-3 ${ERROR_TEXT_CLASS}`,
  resend: 'text-text underline underline-offset-2 disabled:opacity-60 mobile:-my-3 mobile:inline-block mobile:py-3',
});

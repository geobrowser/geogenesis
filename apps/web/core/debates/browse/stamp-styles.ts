import type { OpenRoundPick, ParticipantSlot } from '~/core/debates/api';

/**
 * The agreed "stamps" design's shared pieces (GEO-3277), as the design mockup has them: its two
 * faces, the stamp, the purple banner and the purple tag. Used by the breaks between rounds, the
 * round banner and tag, the claim counter and "Last word", and the recording room's moments
 * (GEO-3315). Each is sized where it is used, in `cqw`,
 * so it keeps its proportions from a feed card to fullscreen.
 */

/** The banners', tags' and question's type: the recording timer's Geist. */
export const LABEL_FONT = { fontFamily: 'var(--font-geist-medium)' } as const;

/** The stamps' type. */
export const STAMP_FONT = { fontFamily: 'var(--font-geist-bold)' } as const;

/**
 * A stamp's face: a solid white plate, square-cornered, snug around its word, in `currentColor`
 * ink. Sized in `em` from its font size, so a small stamp keeps the same proportions.
 */
export const STAMP_CLASS =
  'rounded-[2px] border-[0.07em] border-current bg-white px-[0.4em] pt-[0.12em] pb-[0.1em] leading-[0.9] font-bold tracking-[0.02em] whitespace-nowrap uppercase shadow-[0_0.12em_0.45em_rgba(0,0,0,0.28)]';

/** A purple band across a box's width: the round and turn announcements. */
export const BANNER_CLASS =
  'w-full bg-purple px-[0.6em] py-[0.6em] text-center leading-none font-medium tracking-[0.04em] whitespace-nowrap text-white uppercase';

/** A small purple tag: the round label, the claim counter, "Last word". */
export const TAG_CLASS =
  'rounded-[2px] bg-purple px-[1.8cqw] py-[1cqw] leading-none font-medium tracking-[0.04em] whitespace-nowrap text-white';

/** Each pick's word on its stamp. A missing pick is neither choice. */
export const STAMP_WORD: Record<OpenRoundPick | 'none', string> = { extend: 'Extend', end: 'End', none: 'No pick' };
/** Each pick's ink: Extend in purple, End in black, a missing pick grey and dashed. */
export const STAMP_INK: Record<OpenRoundPick | 'none', string> = {
  extend: 'text-purple',
  end: 'text-text',
  none: 'border-dashed text-grey-04',
};
/** Each tile's stamp leans its own way, so the two read as two hands. The design mockup's tilts. */
export const STAMP_TILT: Record<ParticipantSlot, string> = { 1: '-3.2deg', 2: '2.4deg' };
/** "Ended early" leans the other way from a pick. */
export const ENDED_TILT = '2deg';

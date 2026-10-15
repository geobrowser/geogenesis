import type { OpenRoundPick, ParticipantSlot } from './api';

/**
 * The agreed "stamps" design for Open rounds (GEO-3277, GEO-3315), shared by the published player's
 * breaks and the recording room's moments so a debater sees the same look recording as watching.
 * Geist, square-cornered, a light tilt and no bounce: the game feel without reading as cartoony.
 */

export const STAMP_WORD: Record<OpenRoundPick | 'none', string> = { extend: 'Extend', end: 'End', none: 'No pick' };
export const STAMP_INK: Record<OpenRoundPick | 'none', string> = {
  extend: 'text-purple',
  end: 'text-text',
  none: 'border-dashed text-grey-04',
};
/** Each tile's stamp leans its own way, so the two read as two hands. The design mockup's tilts. */
export const STAMP_TILT: Record<ParticipantSlot, string> = { 1: '-3.2deg', 2: '2.4deg' };
/** "Ended early" leans the other way from a pick. */
export const ENDED_TILT = '2deg';

/**
 * The stamps' shared look: Geist Bold on a solid white face, square-cornered, sized snugly around
 * the word. Sizes are in `em`, so a smaller stamp keeps the same proportions.
 */
export const STAMP_CLASS =
  'rounded-[2px] border-[0.07em] border-current bg-white px-[0.4em] pt-[0.12em] pb-[0.1em] leading-[0.9] font-bold tracking-[0.02em] whitespace-nowrap uppercase shadow-[0_0.12em_0.45em_rgba(0,0,0,0.28)] motion-safe:animate-debate-stamp';
export const STAMP_FONT = { fontFamily: 'var(--font-geist-bold)' } as const;

/** The banners' and the question's type: the recording timer's Geist. */
export const LABEL_FONT = { fontFamily: 'var(--font-geist-medium)' } as const;

/** A purple band across a box's width, the round and turn announcements. Sized where it is used. */
export const BANNER_CLASS =
  'w-full bg-purple px-[0.6em] py-[0.6em] text-center leading-none font-medium tracking-[0.04em] whitespace-nowrap text-white uppercase';

/** A small purple label: "Last word", a round count. Sized where it is used. */
export const TAG_CLASS =
  'inline-flex items-center rounded-[2px] bg-purple px-[0.7em] py-[0.4em] leading-none font-medium tracking-[0.04em] whitespace-nowrap text-white uppercase';

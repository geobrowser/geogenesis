/**
 * The agreed "stamps" design's shared pieces (GEO-3277), as the design mockup has them: its two
 * faces, the stamp, the purple banner and the purple tag. Used by the breaks between rounds, the
 * round banner and tag, the claim counter and "Last word". Each is sized where it is used, in `cqw`,
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

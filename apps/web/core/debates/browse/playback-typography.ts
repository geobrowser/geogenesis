/** Shared with fixed-format playback; matches the typography on master. */
export const PLAYBACK_FONT_FAMILY = 'var(--font-calibre), sans-serif';
export const PLAYBACK_ROUND_EYEBROW_CLASS = 'font-semibold text-white/85';
export const PLAYBACK_ROUND_HEADLINE_CLASS = 'font-bold tracking-[-0.02em] text-white';
/**
 * An outline in every direction rather than the four corners the recording room uses.
 *
 * Its `recordingOverlayTextShadow` is sized for the 7.5rem count-in, where corner copies of a
 * stroke that thick overlap into a continuous edge. At smaller sizes they do not, and the gaps
 * land on the cardinal points — the top of an "R", the side of a "1" — which reads as a broken
 * outline rather than a thin one. Eight copies close it for the cost of four more shadows.
 *
 * In `em` rather than pixels, because this card is sized as a fraction of the player and so spans
 * something like 60px on a phone to 180px on a wide one. A fixed 2px outline is right at the
 * bottom of that range and invisible at the top; a proportional one is the same outline at every
 * width, which is the whole point of sizing the card this way.
 *
 * Black, and white type inside it, which is the opposite of the phrase treatment the debaters see.
 * That one is dark type in a white outline and it works because it sits mid-frame over a face; the
 * seam is where the top tile's scrim has run all the way to black, so dark type there leaves the
 * outline holding an empty shape.
 */
export const PLAYBACK_OUTLINE_STYLE = {
  textShadow:
    '-0.035em -0.035em 0 #000, 0 -0.035em 0 #000, 0.035em -0.035em 0 #000, 0.035em 0 0 #000, 0.035em 0.035em 0 #000, 0 0.035em 0 #000, -0.035em 0.035em 0 #000, -0.035em 0 0 #000, 0 0.05em 0.16em rgba(0,0,0,0.55)',
} as const;

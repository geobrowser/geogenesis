/** A debater's colours in the editor: the avatar palette's two accents, as the prototype has them. */
export const SPEAKER_FILL_CLASS = { 1: 'bg-purple', 2: 'bg-pink' } as const;
/** A sentence's mark in the transcript: a bar in the speaker's colour down its left edge. */
export const SPEAKER_EDGE_CLASS = {
  1: 'shadow-[inset_3px_0_0_var(--color-purple)]',
  2: 'shadow-[inset_3px_0_0_var(--color-pink)]',
} as const;
/** A word's label in the fine-tune panel: the speaker's colour, darkened for pink so it reads as text. */
export const SPEAKER_TEXT_CLASS = { 1: 'text-purple', 2: 'text-[#c5168f]' } as const;
/** A clip's outline in the fine-tune panel. */
export const SPEAKER_OUTLINE_CLASS = { 1: 'border-purple', 2: 'border-pink' } as const;
/** What a clip will play, shaded under the fine-tune panel's waveform. */
export const SPEAKER_TINT_CLASS = { 1: 'bg-purple/15', 2: 'bg-pink/15' } as const;
/** A clip's number chip (GEO-3773): a light tint of the speaker's colour, the number in its ink. */
export const SPEAKER_CHIP_CLASS = { 1: 'bg-purple/12 text-purple', 2: 'bg-pink/12 text-[#c5168f]' } as const;
/** The speaker's ink as a background: a card's progress bar while the reel plays. */
export const SPEAKER_INK_BG_CLASS = { 1: 'bg-purple', 2: 'bg-[#c5168f]' } as const;
/** A clip's segment on the full-debate lane, and the stronger fill of the selected one. */
export const SPEAKER_SEGMENT_CLASS = {
  1: 'bg-purple/22 text-purple',
  2: 'bg-pink/22 text-[#c5168f]',
} as const;
export const SPEAKER_SEGMENT_STRONG_CLASS = {
  1: 'bg-purple/34 text-purple shadow-[inset_0_0_0_1.5px_var(--color-purple)]',
  2: 'bg-pink/34 text-[#c5168f] shadow-[inset_0_0_0_1.5px_#c5168f]',
} as const;
/** No speaker yet (a clip with no whole word): grey. */
export const NO_SPEAKER_CHIP_CLASS = 'bg-grey-01 text-grey-04';

/**
 * A claim the clip can be linked to: its position in the debate's claims, and its text. `retained`:
 * an earlier extraction's, kept because it may be published (geo-chat#352 takes it for a clip).
 */
export type ClaimOption = { index: number; text: string; retained?: true };

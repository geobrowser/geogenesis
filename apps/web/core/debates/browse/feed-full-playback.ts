import { atom } from 'jotai';

import type { Debate } from '~/core/debates/api';

/**
 * Whether the feeds hold a debate's full recordings until the viewer asks to watch.
 *
 * On by default. Every feed card used to autoplay both debaters' full recordings the moment it was
 * reached and buffer the next card's as well, so a visit that only scrolled still downloaded whole
 * debates: signed-out /explore left idle for 90 seconds took 84 MB, 76.5 MB of it the lead card's
 * two raw WebM recordings, and viewers have reported around 300 MB on first load. A held card shows
 * each debater's still, and its recordings are attached only after a tap on Play (or anywhere on
 * the video). After that first tap the feed plays as it always did, so moving to the next debate
 * still starts it and the card after it still buffers.
 *
 * `NEXT_PUBLIC_DEBATE_FEED_FULL_AUTOPLAY=1` turns the hold off and restores the old autoplay
 * without a code change, in case holding turns out worse than the bytes it saves.
 */
export const DEBATE_FEED_HOLDS_FULL_PLAYBACK = process.env.NEXT_PUBLIC_DEBATE_FEED_FULL_AUTOPLAY !== '1';

/**
 * Whether the viewer has started a full recording in this tab.
 *
 * Shared across every feed player and not persisted, like the mute preference: one tap is the
 * viewer saying they are here to watch, and asking again on every card would turn the feed into a
 * wall of Play buttons. A new visit starts held again.
 */
export const feedFullPlaybackStartedAtom = atom(false);

/** A short, muted, looping clip of each debater, played on a held card in place of the still. */
export type DebatePreviewClips = { slot1: string | null; slot2: string | null };

/**
 * Where a debate's preview clips are, if it has any.
 *
 * None yet: nothing produces them, so a held card shows the stills. Kept as its own seam so a
 * clip source (a Cloudflare Stream clip URL, or one geo-chat writes) can be added here without
 * touching the player, which already plays a clip for any slot this returns one for.
 */
export function debatePreviewClips(_debate: Debate): DebatePreviewClips {
  return { slot1: null, slot2: null };
}

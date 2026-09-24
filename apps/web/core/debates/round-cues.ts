import { debateTurnRole } from './formats';
import type { TurnSpan } from './playback-utils';

/**
 * Which round the finished video is showing, and when to say so.
 *
 * A debate's format gives its turns distinct jobs — `debateTurnRole` already knows about
 * rebuttals and closing arguments, and the recording room's countdown reads it — but the
 * processed video never says which one is playing. A viewer arriving mid-debate in a feed has no
 * way to tell an opening statement from a closing argument, and the difference is most of what
 * makes the second one worth watching.
 *
 * Two surfaces, one fact. A card as the turn opens, which is how a broadcast announces a round;
 * then a label beside the turn timer for the rest of it, so "which round is this" stays
 * answerable rather than being said once and taken away.
 *
 * Pure, and a function of the playhead rather than of when a component mounted — the same rule
 * `cardOpacity` follows in `claim-ticker.ts`, for the same reason: the playhead can jump. A
 * viewer who scrubs into the middle of a round card should find it at full strength, and a
 * rewatch has to produce the identical sequence.
 */

/** How long the card holds. Long enough to read a short phrase twice, and no longer. */
export const ROUND_CARD_MS = 1_800;

/** Long enough to register as arriving rather than blinking into place — `claim-ticker.ts`'s value. */
const FADE_IN_MS = 250;
/** The tail of the card's window, over which it leaves instead of vanishing. */
const FADE_OUT_MS = 300;
/**
 * The overlap between the card leaving and the label arriving.
 *
 * The two say the same thing in two places, so they are one movement rather than two events: the
 * label comes up over the card's own fade, which reads as the phrase travelling to the corner
 * instead of being replaced there.
 */
const HANDOVER_MS = 300;

/**
 * What a turn is for, in the words the format already uses.
 *
 * Rounds rather than turns, because a viewer counts exchanges rather than speeches — both
 * debaters speaking is one round, and numbering the turns would call a four-turn debate a
 * four-round one.
 *
 * `debateTurnRole` is the same function the room's countdown and the format details read, so a
 * debate recorded under the old four-turn format labels its rounds the way it always has.
 */
export function roundLabel(turnIndex: number, turnCount: number): string {
  const round = Math.floor(turnIndex / 2) + 1;
  switch (debateTurnRole(turnIndex, turnCount)) {
    case 'opening':
      return `Round ${round} · Opening`;
    case 'rebuttal':
      return `Round ${round} · Rebuttal`;
    case 'closing':
      return `Round ${round} · Closing`;
    default:
      return `Round ${round}`;
  }
}

export type RoundCue = {
  label: string;
  /** 0–1, from the playhead. */
  opacity: number;
};

/** The turn the playhead is inside, or nothing before the first and after the last. */
function currentSpan(spans: TurnSpan[], playheadSeconds: number) {
  return spans.find(span => playheadSeconds >= span.startSeconds && playheadSeconds < span.endSeconds) ?? null;
}

/**
 * The card announcing the round, across the middle of the speaking debater's tile.
 *
 * Over their face, which is allowed here for the same reason the recording room's own phrases
 * are: the turn has just started, nobody has said anything yet, and the card is gone within two
 * seconds. It is on the speaker's tile rather than both because it is announcing *their* turn.
 */
export function roundCardAt(spans: TurnSpan[], playheadSeconds: number): RoundCue | null {
  const current = currentSpan(spans, playheadSeconds);
  if (!current) return null;

  const ageMs = (playheadSeconds - current.startSeconds) * 1_000;
  if (ageMs < 0 || ageMs >= ROUND_CARD_MS) return null;

  const untilEnd = ROUND_CARD_MS - ageMs;
  const opacity = ageMs < FADE_IN_MS ? ageMs / FADE_IN_MS : untilEnd < FADE_OUT_MS ? untilEnd / FADE_OUT_MS : 1;
  if (opacity <= 0) return null;

  return { label: roundLabel(current.index, spans.length), opacity };
}

/**
 * The same label, parked beside the turn timer once the card has gone.
 *
 * Only on the tile whose turn it is: the label belongs to the timer, and the timer is only drawn
 * for the speaker.
 */
export function roundBadgeAt(spans: TurnSpan[], playheadSeconds: number): RoundCue | null {
  const current = currentSpan(spans, playheadSeconds);
  if (!current) return null;

  const ageMs = (playheadSeconds - current.startSeconds) * 1_000;
  const opacity = Math.max(0, Math.min(1, (ageMs - (ROUND_CARD_MS - HANDOVER_MS)) / HANDOVER_MS));
  if (opacity <= 0) return null;

  return { label: roundLabel(current.index, spans.length), opacity };
}

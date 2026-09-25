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
 * Two surfaces, one fact, on two different clocks. A card across the seam between the tiles as a
 * round *opens*, which is how a broadcast announces one; then a label beside the turn timer for
 * every turn of that round, so "which round is this" stays answerable rather than being said once
 * and taken away.
 *
 * The card fires on the first turn of a round and not on the reply, because a round is the unit it
 * is announcing. Saying "Round 2 · Rebuttal" again thirty seconds later, over the second debater,
 * would be the same announcement made twice — and the badge beside the timer is already holding
 * that fact for both of them.
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
 *
 * Only the turn that opens a round has a card to hand over from. On the reply the badge simply
 * arrives with the turn, over {@link FADE_IN_MS}.
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
 * Whether this turn is the one that opens its round.
 *
 * Rounds are pairs, so the openers are the even turns — the same arithmetic {@link roundLabel} and
 * `debateTurnRole` do, which is what keeps a card and the badge that follows it saying one thing.
 *
 * An odd turn count leaves a final unpaired turn, and it opens a round of its own: a debate that
 * ends on a single closing statement should announce it.
 */
function opensRound(span: TurnSpan) {
  return span.index % 2 === 0;
}

/**
 * The card announcing the round, across the seam between the two tiles.
 *
 * Centred on the seam rather than over the speaker, in the strip the subtitle otherwise owns —
 * the one band of the player that is never a face. A round belongs to both debaters, and putting
 * its name over one of them made it look like a label for that person's turn. It also meant the
 * announcement landed on whoever had just started talking, which is the worst two seconds of the
 * video to cover someone's face.
 *
 * Nothing before the first turn and nothing on the reply: see {@link opensRound}.
 */
export function roundCardAt(spans: TurnSpan[], playheadSeconds: number): RoundCue | null {
  const current = currentSpan(spans, playheadSeconds);
  if (!current || !opensRound(current)) return null;

  const ageMs = (playheadSeconds - current.startSeconds) * 1_000;
  if (ageMs < 0 || ageMs >= ROUND_CARD_MS) return null;

  const untilEnd = ROUND_CARD_MS - ageMs;
  const opacity = ageMs < FADE_IN_MS ? ageMs / FADE_IN_MS : untilEnd < FADE_OUT_MS ? untilEnd / FADE_OUT_MS : 1;
  if (opacity <= 0) return null;

  return { label: roundLabel(current.index, spans.length), opacity };
}

/**
 * The same label, beside the turn timer — on every turn, for as long as that turn runs.
 *
 * Only on the tile whose turn it is: the label belongs to the timer, and the timer is only drawn
 * for the speaker. So over a round the badge crosses from one tile to the other as the turn does,
 * carrying the same words, which is what makes the round legible as something the two of them are
 * in together.
 *
 * Where a card opened the round it comes up over that card's fade. Where none did — the reply — it
 * arrives with the turn, because there is nothing for it to wait for.
 */
export function roundBadgeAt(spans: TurnSpan[], playheadSeconds: number): RoundCue | null {
  const current = currentSpan(spans, playheadSeconds);
  if (!current) return null;

  const ageMs = (playheadSeconds - current.startSeconds) * 1_000;
  const from = opensRound(current) ? ROUND_CARD_MS - HANDOVER_MS : 0;
  const over = opensRound(current) ? HANDOVER_MS : FADE_IN_MS;
  const opacity = Math.max(0, Math.min(1, (ageMs - from) / over));
  if (opacity <= 0) return null;

  return { label: roundLabel(current.index, spans.length), opacity };
}

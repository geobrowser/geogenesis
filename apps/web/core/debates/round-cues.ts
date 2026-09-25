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
 * Both are measured from the round's start, so this is the whole of the badge's arrival — there is
 * no second case for the reply, which simply finds the handover long finished.
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
export function roundParts(turnIndex: number, turnCount: number): { round: string; role: string | null } {
  const round = `Round ${Math.floor(turnIndex / 2) + 1}`;
  switch (debateTurnRole(turnIndex, turnCount)) {
    case 'opening':
      return { round, role: 'Opening' };
    case 'rebuttal':
      return { round, role: 'Rebuttal' };
    case 'closing':
      return { round, role: 'Closing' };
    default:
      // A middle round of a long format is a round and nothing more; the format has no name for it.
      return { round, role: null };
  }
}

/** The same fact on one line, which is the shape the badge beside the timer needs. */
export function roundLabel(turnIndex: number, turnCount: number): string {
  const { round, role } = roundParts(turnIndex, turnCount);
  return role ? `${round} · ${role}` : round;
}

export type RoundCue = {
  /** One line — "Round 2 · Rebuttal" — which is what the badge wears. */
  label: string;
  /**
   * The same two words apart, which is what the card wears.
   *
   * The card is read across a room's worth of distance at the top of a round and the badge is read
   * at arm's length beside a timer, so one string cannot serve both: the card wants the round and
   * its name stacked and large, the badge wants them on the single line a 32px pill allows.
   */
  round: string;
  /** Null in a middle round the format gives no name to — then the card is the round alone. */
  role: string | null;
  /** 0–1, from the playhead. */
  opacity: number;
};

function cueFor(span: TurnSpan, turnCount: TurnCount, opacity: number): RoundCue {
  const { round, role } = roundParts(span.index, turnCount);
  return { label: role ? `${round} · ${role}` : round, round, role, opacity };
}

/**
 * How many turns the *format* has, which is not how many the render cut.
 *
 * `debateTurnRole` reads the count to decide which round is the closing one, so it has to be the
 * allowance's — a debater who yields their last turn instantly leaves a segment short, and taking
 * the count from the spans would promote the round before it to "Closing" and caption a rebuttal
 * as one. The same number the recording room's own countdown classified turns with.
 */
type TurnCount = number;

/** The turn the playhead is inside, or nothing before the first and after the last. */
function currentSpan(spans: TurnSpan[], playheadSeconds: number) {
  return spans.find(span => playheadSeconds >= span.startSeconds && playheadSeconds < span.endSeconds) ?? null;
}

/**
 * Rounds are pairs of turns — the same arithmetic {@link roundLabel} and `debateTurnRole` do,
 * which is what keeps the card and the badge that follows it saying one thing. An odd turn count
 * leaves a final unpaired turn, and it is a round of its own.
 */
function roundOf(span: TurnSpan) {
  return Math.floor(span.index / 2);
}

/**
 * Where a round began on the rendered timeline, which is not always where its opening turn did.
 *
 * Both cue windows are measured from here rather than from the turn the playhead happens to be
 * in, because the turn is the wrong unit for an announcement about the round. Two things go wrong
 * when it is used:
 *
 * A debater who yields inside the card's 1.8s ends their turn under it. Anchored to the turn, the
 * card vanishes at the boundary at whatever strength it had reached — a hard cut in the middle of
 * a fade. Anchored to the round, it plays out across the reply, which is where it belongs anyway:
 * the round is what it is naming, and the round has not ended.
 *
 * An instant yield renders a zero-length segment, which `sortTurnSegments` drops. A round whose
 * opening turn is dropped has no even-indexed span at all, so a rule like "fire on the opener"
 * skips that round in silence — the one round the viewer most needs named, because the debate has
 * just done something unusual. Taking the earliest span still standing in the round announces it
 * from the reply instead.
 */
function roundStartSeconds(spans: TurnSpan[], round: number) {
  return spans.reduce(
    (earliest, span) => (roundOf(span) === round ? Math.min(earliest, span.startSeconds) : earliest),
    Number.POSITIVE_INFINITY
  );
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
 * Once per round and not once per turn: the window is measured from the round's start, so by the
 * time the reply begins it has long since closed. See {@link roundStartSeconds}.
 */
export function roundCardAt(spans: TurnSpan[], turnCount: TurnCount, playheadSeconds: number): RoundCue | null {
  const current = currentSpan(spans, playheadSeconds);
  if (!current) return null;

  const ageMs = (playheadSeconds - roundStartSeconds(spans, roundOf(current))) * 1_000;
  if (ageMs < 0 || ageMs >= ROUND_CARD_MS) return null;

  const untilEnd = ROUND_CARD_MS - ageMs;
  const opacity = ageMs < FADE_IN_MS ? ageMs / FADE_IN_MS : untilEnd < FADE_OUT_MS ? untilEnd / FADE_OUT_MS : 1;
  if (opacity <= 0) return null;

  return cueFor(current, turnCount, opacity);
}

/**
 * The same label, beside the turn timer — on every turn, for as long as that turn runs.
 *
 * Only on the tile whose turn it is: the label belongs to the timer, and the timer is only drawn
 * for the speaker. So over a round the badge crosses from one tile to the other as the turn does,
 * carrying the same words, which is what makes the round legible as something the two of them are
 * in together.
 *
 * Measured from the round's start, like the card, so it comes up over that card's fade wherever
 * the card was drawn. By the reply the handover is long past, so the badge is simply already up —
 * which is what it was doing before, without needing a second case to say so.
 */
export function roundBadgeAt(spans: TurnSpan[], turnCount: TurnCount, playheadSeconds: number): RoundCue | null {
  const current = currentSpan(spans, playheadSeconds);
  if (!current) return null;

  const ageMs = (playheadSeconds - roundStartSeconds(spans, roundOf(current))) * 1_000;
  const opacity = Math.max(0, Math.min(1, (ageMs - (ROUND_CARD_MS - HANDOVER_MS)) / HANDOVER_MS));
  if (opacity <= 0) return null;

  return cueFor(current, turnCount, opacity);
}

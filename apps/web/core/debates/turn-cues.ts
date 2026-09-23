import type { ParticipantSlot } from './api';
import { debateTurnRole } from './formats';
import type { TurnSpan } from './playback-utils';

/**
 * The turn-clock overlays, for the finished video.
 *
 * The recording room already draws all of this — `GO!`, `Wrap it up!`, a count-in — and the two
 * people in the room are the only people who have ever seen it. A processed debate replays the
 * same clock to its audience, so the language is lifted rather than invented: the phrases, their
 * type and their timings are `debate-video-tile.tsx`'s, and this module is the part that decides
 * *when*, off a playhead instead of off a live countdown.
 *
 * Pure, and pure on purpose. A cue is a function of the playhead, never of when a component
 * mounted — the same rule `cardOpacity` follows and for the same reason: the playhead can jump.
 * Scrubbing into the middle of a countdown has to land on that numeral at full strength, and
 * rewatching a debate has to produce the identical sequence.
 */
export type TurnCueKind =
  /** The turn starting, on the incoming tile. The room's `GO!`. */
  | 'go'
  /** The last seconds of a turn, on the speaker's tile. The room's `Wrap it up!`. */
  | 'wrap-up'
  /** The final numerals, on the speaker's tile. The room's count-in, counting out. */
  | 'countdown'
  /** The buzzer, on the tile that just finished. */
  | 'time'
  /** What this round is for, once the shouting is over. */
  | 'round'
  /** The hand-off, on the tile about to speak. */
  | 'up-next';

export type TurnCue = {
  kind: TurnCueKind;
  slot: ParticipantSlot;
  /** 0–1, from the playhead. See {@link cueOpacity}. */
  opacity: number;
  /**
   * The numeral a cue carries, where it has one: the seconds left for `countdown` and `up-next`.
   * Whole seconds, because it is read rather than measured.
   */
  seconds?: number;
  /** What a `round` cue says. Built here so the wording lives with the timing that shows it. */
  label?: string;
};

/**
 * How long `GO!` holds, matching `localTurnGoIsVisible`'s 2s in the room.
 *
 * Every constant here is the room's. Where the room had no answer — nothing in it says "Time!",
 * because the debater who has just run out of time does not need telling — the value is chosen to
 * sit inside the budget the room already set, which is that nothing covers a face for longer than
 * `Wrap it up!` does.
 */
export const GO_MS = 2_000;
/** `wrapItUpIsVisible` fires at 5s. It hands over to the numerals at 3. */
export const WRAP_UP_FROM_SECONDS = 5;
export const COUNTDOWN_FROM_SECONDS = 3;
/** The buzzer, over the outgoing tile while the incoming one is already saying `GO!`. */
export const TIME_MS = 1_400;
/**
 * When the hand-off is announced on the tile about to speak, and for how long.
 *
 * Ten seconds out: long enough to look up and find the tile that is about to matter, short enough
 * that it is still about to happen.
 *
 * It fires *once* and holds, rather than counting down for the whole ten seconds, and that is a
 * placement decision as much as a pacing one. Every other phrase here crosses the middle of a tile
 * for about two seconds; a cue that had to stay up for ten could not sit there, and the only other
 * space on the tile is the bottom band, where the other debater's claim card may still be
 * lingering. So it takes the same place as everything else and leaves again — and the number is
 * read at the moment it is true.
 */
export const UP_NEXT_AT_SECONDS = 10;
export const UP_NEXT_MS = 2_200;
/**
 * How long the round card holds, and where it sits relative to `GO!`.
 *
 * After it rather than instead of it. `GO!` is the room's own signature and says *go*; this says
 * what to go and do, which is a different sentence and a quieter one. Reading them at once would
 * be two shouts over one face.
 *
 * On the opening turn there is no `GO!` to follow, so this runs from the first frame and doubles
 * as the video's title card — which is the one moment a feed viewer has no idea what they have
 * scrolled into.
 */
export const ROUND_MS = 1_800;

/** Long enough to register as arriving rather than blinking into place — `claim-ticker.ts`'s value. */
const FADE_IN_MS = 250;
/** The tail of a cue's window, over which it leaves instead of vanishing. */
const FADE_OUT_MS = 300;

/**
 * How strong a cue is this far into its own window.
 *
 * Exported because the claim tally uses the same envelope, and two overlays on one tile fading at
 * different rates reads as one of them being broken.
 */
export function cueOpacity(ageMs: number, windowMs: number): number {
  if (ageMs < 0 || ageMs >= windowMs) return 0;
  if (ageMs < FADE_IN_MS) return ageMs / FADE_IN_MS;
  const untilEnd = windowMs - ageMs;
  if (untilEnd < FADE_OUT_MS) return untilEnd / FADE_OUT_MS;
  return 1;
}

/**
 * Every cue on screen at this instant, at most one per tile.
 *
 * At most one per tile is the whole of the priority stack. Cues are read out in the order below
 * and the first that matches a tile takes it, so a turn change puts `time` on the outgoing tile
 * and `go` on the incoming one — one event across the player rather than two unrelated ones on
 * two halves — and nothing can ever stack two phrases over one face.
 *
 * Returned as a list rather than a map because the caller renders per tile and an empty list is
 * the common case: for most of a turn nothing is firing at all, which is the point.
 */
export function turnCuesAt(spans: TurnSpan[], playheadSeconds: number): TurnCue[] {
  if (spans.length === 0) return [];

  const current = spans.find(span => playheadSeconds >= span.startSeconds && playheadSeconds < span.endSeconds);
  if (!current) return [];

  const cues: TurnCue[] = [];
  const previous = current.index > 0 ? spans[current.index - 1] : null;
  const next = spans[current.index + 1] ?? null;
  const sinceStartMs = (playheadSeconds - current.startSeconds) * 1_000;
  // Off the clock the debaters were watching, not off the cut — see `TurnSpan.clockStartSeconds`.
  // A turn that retained speech from before its clock started is still counted down from the
  // clock, which is what the ring in the room did.
  const remainingSeconds = current.endSeconds - Math.max(playheadSeconds, current.clockStartSeconds);

  // --- the speaking tile.
  if (remainingSeconds > 0 && remainingSeconds <= COUNTDOWN_FROM_SECONDS) {
    // One beat per numeral, each with its own envelope, so the digit lands rather than crossfading
    // into the next. `ceil` is what the room shows: 2.4s left reads as 3, not as 2.
    const seconds = Math.ceil(remainingSeconds);
    const intoBeatMs = (seconds - remainingSeconds) * 1_000;
    cues.push({ kind: 'countdown', slot: current.slot, seconds, opacity: cueOpacity(intoBeatMs, 1_000) });
  } else if (remainingSeconds > COUNTDOWN_FROM_SECONDS && remainingSeconds <= WRAP_UP_FROM_SECONDS) {
    const windowMs = (WRAP_UP_FROM_SECONDS - COUNTDOWN_FROM_SECONDS) * 1_000;
    const ageMs = (WRAP_UP_FROM_SECONDS - remainingSeconds) * 1_000;
    cues.push({ kind: 'wrap-up', slot: current.slot, opacity: cueOpacity(ageMs, windowMs) });
  } else if (sinceStartMs < GO_MS && previous) {
    // No `GO!` on the opening turn. The video has only just started and the viewer has not been
    // shown a clock yet, so the first thing they would see is a shout with no context.
    cues.push({ kind: 'go', slot: current.slot, opacity: cueOpacity(sinceStartMs, GO_MS) });
  } else {
    // The round card takes the same slot once `GO!` is done with it — see {@link ROUND_MS}.
    const roundFromMs = previous ? GO_MS : 0;
    const intoRoundMs = sinceStartMs - roundFromMs;
    if (intoRoundMs >= 0 && intoRoundMs < ROUND_MS) {
      cues.push({
        kind: 'round',
        slot: current.slot,
        label: roundLabel(current.index, spans.length),
        opacity: cueOpacity(intoRoundMs, ROUND_MS),
      });
    }
  }

  // --- the other tile.
  if (previous && sinceStartMs < TIME_MS) {
    cues.push({ kind: 'time', slot: previous.slot, opacity: cueOpacity(sinceStartMs, TIME_MS) });
  } else if (next && remainingSeconds > 0 && remainingSeconds <= UP_NEXT_AT_SECONDS) {
    const ageMs = (UP_NEXT_AT_SECONDS - remainingSeconds) * 1_000;
    cues.push({
      kind: 'up-next',
      slot: next.slot,
      seconds: UP_NEXT_AT_SECONDS,
      opacity: cueOpacity(ageMs, UP_NEXT_MS),
    });
  }

  return cues.filter(cue => cue.opacity > 0);
}

/**
 * What a turn is for, in the words the format already uses.
 *
 * `debateTurnRole` is the same function the room's countdown and the format details read, so a
 * debate recorded under the old four-turn format labels its rounds the way it always has.
 * Rounds rather than turns, because a viewer counts exchanges, not speeches.
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

/** This tile's cue, or nothing. The shape every consumer actually wants. */
export function turnCueForSlot(cues: TurnCue[], slot: ParticipantSlot): TurnCue | null {
  return cues.find(cue => cue.slot === slot) ?? null;
}

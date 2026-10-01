import type { ParticipantSlot } from './api';
import type { TurnSpan } from './playback-utils';

/**
 * How long each debater's teaser clip runs before it loops, in seconds.
 *
 * Inside the 5–10s the design asks for, at the short end: the clip is a hook, not a preview, and a
 * shorter window is less of the recording to fetch before it can loop.
 */
export const TEASER_WINDOW_SECONDS = 6;

/**
 * Seconds skipped at the top of a debater's first turn before their clip starts.
 *
 * A turn's span opens on the handoff, where the incoming speaker is often still settling or the
 * previous one is finishing a word (GEO-2754). Two seconds in, they are talking.
 */
export const TEASER_LEAD_IN_SECONDS = 2;

/** A stretch of one recording to loop, in that recording's own time (not debate time). */
export type TeaserWindow = { startSeconds: number; endSeconds: number };

/**
 * Where each debater's silent teaser clip sits in their own recording.
 *
 * The pre-roll shows both debaters moving at once so the debate reads as an argument already under
 * way. Each tile loops its own debater *talking*: the opening of their first turn. A debater the
 * timeline gives no turn falls back to the start of their recording, which still moves.
 *
 * `offsets` are the recordings' start offsets against the debate clock, as `useDebatePlayback`
 * computes them: element time is debate time minus the slot's offset.
 */
export function teaserWindows(
  turnSpans: TurnSpan[],
  offsets: { slot1: number; slot2: number },
  windowSeconds = TEASER_WINDOW_SECONDS
): Record<ParticipantSlot, TeaserWindow> {
  const windowFor = (slot: ParticipantSlot): TeaserWindow => {
    const offset = slot === 1 ? offsets.slot1 : offsets.slot2;
    const span = turnSpans
      .filter(candidate => candidate.slot === slot)
      .sort((a, b) => a.startSeconds - b.startSeconds)[0];
    if (!span) {
      const start = Math.max(0, -offset);
      return { startSeconds: start, endSeconds: start + windowSeconds };
    }
    // Lead in only when the turn is long enough to keep a full window after it.
    const turnLength = span.endSeconds - span.startSeconds;
    const leadIn = turnLength >= TEASER_LEAD_IN_SECONDS + windowSeconds ? TEASER_LEAD_IN_SECONDS : 0;
    const debateStart = span.startSeconds + leadIn;
    const debateEnd = Math.min(span.endSeconds, debateStart + windowSeconds);
    const startSeconds = Math.max(0, debateStart - offset);
    return { startSeconds, endSeconds: Math.max(startSeconds + 1, debateEnd - offset) };
  };
  return { 1: windowFor(1), 2: windowFor(2) };
}

/** Rounds are pairs of turns, the way the round cues name them. */
export function roundCount(turnCount: number): number {
  return turnCount > 0 ? Math.ceil(turnCount / 2) : 0;
}

/**
 * The stakes line under the claim: "4 min · 2 rounds · 1,240 took a side".
 *
 * Each part is dropped rather than guessed when its number is not known yet: a runtime of "0 min"
 * or "0 took a side" off a query still in flight would be a claim about the debate that is really a
 * claim about the network.
 */
export function stakesLine({
  timelineSeconds,
  turnCount,
  sideCount,
}: {
  timelineSeconds: number;
  turnCount: number;
  /** People who have taken a side on the claim, or null while unknown. */
  sideCount: number | null;
}): string {
  const parts: string[] = [];
  if (timelineSeconds > 0) parts.push(`${Math.max(1, Math.round(timelineSeconds / 60))} min`);
  const rounds = roundCount(turnCount);
  if (rounds > 0) parts.push(`${rounds} ${rounds === 1 ? 'round' : 'rounds'}`);
  if (sideCount !== null && sideCount > 0) parts.push(`${sideCount.toLocaleString('en-US')} took a side`);
  return parts.join(' · ');
}

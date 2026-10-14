import type {
  Debate,
  DebateMediaCondensedBreak,
  DebateMediaEarlyEndGap,
  DebateMediaRoundPick,
  DebateMediaTurnSegment,
  OpenRoundPick,
  ParticipantSlot,
} from './api';
import { isOpenRoundsDebate, openRoundsRequiredRebuttalRounds } from './open-rounds';

/**
 * The breaks between Open rounds in a published video (GEO-3277), on the player's clock.
 *
 * A render with condensed breaks (GEO-3276) plays each one as a short, sped-up, silent catch-up and
 * draws nothing into the video, so the player draws what the recording room drew there: the picks
 * turning over, then the next round or "That's a wrap". Everything here is a function of the
 * playhead, like `round-cues.ts`, so a viewer who scrubs into a break finds it where it would be.
 */

/**
 * The share of a break the picks have to turn before the result takes over. A third, so the
 * 2.4 s after an Extend gives the cards 0.8 s, which is what the approved mockup plays.
 */
export const BREAK_FLIP_SHARE = 1 / 3;

/** How long "Ended early" stays up after the cut, so the incoming name is read before it goes. */
export const EARLY_END_HOLD_MS = 700;

export type BreakPicks = Record<ParticipantSlot, OpenRoundPick | null>;

export type BreakCue = {
  kind: DebateMediaCondensedBreak['kind'];
  /** How far into the break the playhead is. */
  elapsedMs: number;
  durationMs: number;
  /** When the result (the round, or the wrap) takes over from the picks. */
  resultStartMs: number;
  /** Each debater's pick for the round that ended; `null` for a lead-in, where nobody picked. */
  picks: BreakPicks | null;
  /** The round the break leads into, or `null` after the final End. */
  nextRoundIndex: number | null;
};

/** The break the playhead is inside, or `null`. */
export function breakCueAt(
  breaks: readonly DebateMediaCondensedBreak[],
  picks: readonly DebateMediaRoundPick[],
  playheadMs: number
): BreakCue | null {
  const current = breaks.find(entry => playheadMs >= entry.output_start_ms && playheadMs < entry.output_end_ms);
  if (!current) return null;

  const durationMs = Math.max(1, current.output_end_ms - current.output_start_ms);
  const hasPicks = current.kind !== 'lead_in';
  return {
    kind: current.kind,
    elapsedMs: playheadMs - current.output_start_ms,
    durationMs,
    resultStartMs: hasPicks ? Math.round(durationMs * BREAK_FLIP_SHARE) : 0,
    picks: hasPicks ? finalPicks(picks, current.round_index) : null,
    nextRoundIndex: current.next_round_index ?? null,
  };
}

/**
 * What each debater ended on for a round. `round_picks` lists every save, changes included, so
 * the last one per slot is the pick that counted; a slot with none did not pick.
 */
export function finalPicks(picks: readonly DebateMediaRoundPick[], roundIndex: number): BreakPicks {
  const result: BreakPicks = { 1: null, 2: null };
  const latestAt: Record<ParticipantSlot, number> = { 1: Number.NEGATIVE_INFINITY, 2: Number.NEGATIVE_INFINITY };
  for (const entry of picks) {
    if (entry.round_index !== roundIndex) continue;
    const at = Date.parse(entry.at);
    if (!(at >= latestAt[entry.participant_slot])) continue;
    latestAt[entry.participant_slot] = at;
    result[entry.participant_slot] = entry.pick;
  }
  return result;
}

/** Whether a condensed break already announced `roundIndex`, so the round card need not. */
export function breakAnnouncesRound(breaks: readonly DebateMediaCondensedBreak[], roundIndex: number) {
  return breaks.some(entry => entry.next_round_index === roundIndex);
}

export type EarlyEndCue = {
  /** Who ended their turn early, and who speaks next. */
  endedSlot: ParticipantSlot;
  nextSlot: ParticipantSlot;
};

/**
 * "Ended early" and the next speaker's turn, around an early end the render cut down to a short
 * quiet. From the start of the kept quiet before the cut until shortly after it, so it covers the
 * jump and is gone before the next speaker is well into their first sentence.
 */
export function earlyEndCueAt(
  gaps: readonly DebateMediaEarlyEndGap[],
  segments: readonly DebateMediaTurnSegment[],
  playheadMs: number
): EarlyEndCue | null {
  const gap = gaps.find(
    entry => playheadMs >= entry.output_ms - entry.quiet_kept_ms && playheadMs < entry.output_ms + EARLY_END_HOLD_MS
  );
  if (!gap) return null;
  const ended = segments.find(segment => segment.turn_index === gap.turn_index);
  const next = segments.find(segment => segment.turn_index === gap.next_turn_index);
  if (!ended || !next) return null;
  return { endedSlot: ended.participant_slot, nextSlot: next.participant_slot };
}

/**
 * Whether the playhead is in a required round's lead-in that the render kept at full length, which
 * every Open rounds video rendered before GEO-3276 did. There the lead-in sits at the front of the
 * round's first turn, before its countdown, and with both mics open between rounds (#2838) it can
 * hold talk that was never meant to be published. A condensed render splits it out into a break,
 * so its turn starts at its countdown and this never applies to it.
 */
export function inUncondensedLeadIn(
  debate: Pick<Debate, 'open_rounds'>,
  segments: readonly DebateMediaTurnSegment[],
  playheadMs: number
) {
  if (!isOpenRoundsDebate(debate) || (debate.open_rounds.required_round_lead_in_ms ?? 0) <= 0) return false;
  const required = openRoundsRequiredRebuttalRounds(debate.open_rounds);
  return segments.some(segment => {
    const round = Math.floor(segment.turn_index / 2);
    if (segment.turn_index % 2 !== 0 || round < 1 || round > required) return false;
    const countdownStartMs = segment.countdown_start_ms ?? segment.output_start_ms;
    return playheadMs >= segment.output_start_ms && playheadMs < countdownStartMs;
  });
}

/**
 * Where the last break ends. A final End's reveal plays after the last turn, so the video runs on
 * past the last turn segment by this much.
 */
export function breaksEndMs(breaks: readonly DebateMediaCondensedBreak[]) {
  return breaks.reduce((latest, entry) => Math.max(latest, entry.output_end_ms), 0);
}

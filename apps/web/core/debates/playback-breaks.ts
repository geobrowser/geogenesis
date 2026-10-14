import type {
  Debate,
  DebateMediaResponse,
  DebateMediaRoundPick,
  DebateMediaTurnSegment,
  OpenRoundPick,
  ParticipantSlot,
} from './api';
import { flipEndsMs } from './open-round-reveal';
import { isOpenRoundsDebate, openRoundsRequiredRebuttalRounds } from './open-rounds';
import type { PlaybackClock } from './playback-clock';

/**
 * The breaks between Open rounds in a published debate (GEO-3277), on the web player's clock.
 *
 * The player plays the raw recordings, so every break runs at its real length: the pick window
 * after a round, then the reveal and the opener's count-in, or a required round's lead-in. Nobody
 * holds a turn through any of it, so nothing is heard (both mics are open between rounds since
 * #2838), and the player draws what the recording room showed there instead: "Keep debating?"
 * while they pick, the picks turning over, then the next round or "That's a wrap". Everything is a
 * function of the playhead, like `round-cues.ts`, so a viewer who scrubs in finds it where it was.
 */

/** How long "Ended early" stays up after the next speaker's first word. */
export const EARLY_END_HOLD_MS = 700;

/** geo-chat's result window, for a debate whose payload does not carry its `open_rounds` block. */
const DEFAULT_RESULT_WINDOW_MS = 3_000;

/** How long the picks take to turn over: the room's own share of the debate's result window. */
export function revealFlipMs(debate: Pick<Debate, 'open_rounds'>) {
  return flipEndsMs(debate.open_rounds?.result_window_ms ?? DEFAULT_RESULT_WINDOW_MS);
}

export type PlayerBreak = {
  kind: 'lead_in' | 'extend' | 'final_end';
  /** The round that ended at the break, and the one it leads into (`null` after the final End). */
  roundIndex: number;
  nextRoundIndex: number | null;
  /** When the round before it ended. The pick window runs from here to `startMs`; none for a lead-in. */
  decidingStartMs: number;
  /** The reveal, or the lead-in: from the round's resolution until the next round, or thanking, starts. */
  startMs: number;
  endMs: number;
};

/** The quiet of an early end inside a round: from the last word of the turn that ended to the next speaker's first. */
export type PlayerEarlyEnd = { turnIndex: number; nextTurnIndex: number; startMs: number; endMs: number };

export type PlaybackBreaks = {
  breaks: PlayerBreak[];
  earlyEnds: PlayerEarlyEnd[];
  picks: DebateMediaRoundPick[];
};

export const NO_PLAYBACK_BREAKS: PlaybackBreaks = { breaks: [], earlyEnds: [], picks: [] };

/**
 * Every break and early end in a debate, on the player's clock.
 *
 * `segments` must already be on that clock. A condensed render (GEO-3276) lists its breaks and early
 * ends with their source positions. An older render lists only its kept Extend reveals, and keeps
 * a required round's lead-in at the front of that round's first turn, before its countdown, which is
 * where it is found here.
 */
export function playbackBreaksFrom(
  debate: Pick<Debate, 'open_rounds'>,
  media: Pick<DebateMediaResponse, 'condensed_breaks' | 'early_end_gaps' | 'round_results' | 'round_picks'> | undefined,
  segments: readonly DebateMediaTurnSegment[],
  clock: PlaybackClock
): PlaybackBreaks {
  if (!media) return NO_PLAYBACK_BREAKS;

  const breaks: PlayerBreak[] = (media.condensed_breaks ?? []).map(entry => ({
    kind: entry.kind,
    roundIndex: entry.round_index,
    nextRoundIndex: entry.next_round_index ?? null,
    decidingStartMs: entry.kind === 'lead_in' ? entry.source_start_ms : clock(entry.output_start_ms, 'end'),
    startMs: entry.source_start_ms,
    endMs: entry.source_end_ms,
  }));

  for (const result of media.round_results ?? []) {
    if (breaks.some(entry => entry.kind === 'extend' && entry.roundIndex === result.round_index)) continue;
    breaks.push({
      kind: 'extend',
      roundIndex: result.round_index,
      nextRoundIndex: result.round_index + 1,
      decidingStartMs: clock(result.output_start_ms, 'end'),
      startMs: result.source_start_ms,
      endMs: result.source_end_ms,
    });
  }

  if (isOpenRoundsDebate(debate) && (debate.open_rounds.required_round_lead_in_ms ?? 0) > 0) {
    const required = openRoundsRequiredRebuttalRounds(debate.open_rounds);
    for (const segment of segments) {
      const round = Math.floor(segment.turn_index / 2);
      if (segment.turn_index % 2 !== 0 || round < 1 || round > required) continue;
      if (breaks.some(entry => entry.kind === 'lead_in' && entry.nextRoundIndex === round)) continue;
      const countdownStartMs = segment.countdown_start_ms ?? segment.output_start_ms;
      if (countdownStartMs <= segment.output_start_ms) continue;
      breaks.push({
        kind: 'lead_in',
        roundIndex: round - 1,
        nextRoundIndex: round,
        decidingStartMs: segment.output_start_ms,
        startMs: segment.output_start_ms,
        endMs: countdownStartMs,
      });
    }
  }

  return {
    breaks: breaks.sort((a, b) => a.decidingStartMs - b.decidingStartMs),
    earlyEnds: (media.early_end_gaps ?? []).map(gap => ({
      turnIndex: gap.turn_index,
      nextTurnIndex: gap.next_turn_index,
      startMs: gap.source_start_ms,
      endMs: gap.source_end_ms,
    })),
    picks: media.round_picks ?? [],
  };
}

export type BreakPicks = Record<ParticipantSlot, OpenRoundPick | null>;

export type BreakCue =
  | {
      phase: 'deciding';
      roundIndex: number;
      nextRoundIndex: number | null;
      /** Who has saved a pick so far. Never which: the picks stay blind until the reveal, as in the room. */
      picked: Record<ParticipantSlot, boolean>;
    }
  | {
      phase: 'reveal';
      kind: PlayerBreak['kind'];
      /** How far into the reveal, or lead-in, the playhead is. */
      elapsedMs: number;
      durationMs: number;
      /** When the result (the round, or the wrap) takes over from the picks turning. */
      resultStartMs: number;
      /** Each debater's pick for the round that ended; `null` for a lead-in, where nobody picked. */
      picks: BreakPicks | null;
      nextRoundIndex: number | null;
    };

/**
 * What the player shows at the playhead, or `null` outside every break.
 *
 * `debateStartedAtMs` places each saved pick on the player's clock, whose zero is the debate's
 * start, for the "picked" ticks; without it nobody shows as having picked. `flipMs` is how long the
 * picks take to turn: the room's share of its result window.
 */
export function breakCueAt(
  breaks: readonly PlayerBreak[],
  picks: readonly DebateMediaRoundPick[],
  playheadMs: number,
  { debateStartedAtMs, flipMs }: { debateStartedAtMs: number | null; flipMs: number }
): BreakCue | null {
  const current = breaks.find(entry => playheadMs >= entry.decidingStartMs && playheadMs < entry.endMs);
  if (!current) return null;

  if (playheadMs < current.startMs) {
    const picked: Record<ParticipantSlot, boolean> = { 1: false, 2: false };
    if (debateStartedAtMs !== null) {
      for (const entry of picks) {
        if (entry.round_index === current.roundIndex && Date.parse(entry.at) - debateStartedAtMs <= playheadMs) {
          picked[entry.participant_slot] = true;
        }
      }
    }
    return { phase: 'deciding', roundIndex: current.roundIndex, nextRoundIndex: current.nextRoundIndex, picked };
  }

  const durationMs = Math.max(1, current.endMs - current.startMs);
  const hasPicks = current.kind !== 'lead_in';
  return {
    phase: 'reveal',
    kind: current.kind,
    elapsedMs: playheadMs - current.startMs,
    durationMs,
    resultStartMs: hasPicks ? Math.min(flipMs, durationMs) : 0,
    picks: hasPicks ? finalPicks(picks, current.roundIndex) : null,
    nextRoundIndex: current.nextRoundIndex,
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

/** Whether a break already announced `roundIndex`, so the round card need not. */
export function breakAnnouncesRound(breaks: readonly PlayerBreak[], roundIndex: number) {
  return breaks.some(entry => entry.nextRoundIndex === roundIndex);
}

export type EarlyEndCue = {
  /** Who ended their turn early, and who speaks next. */
  endedSlot: ParticipantSlot;
  nextSlot: ParticipantSlot;
};

/** "Ended early" and whose turn it is, over an early end's quiet and a moment past it. */
export function earlyEndCueAt(
  earlyEnds: readonly PlayerEarlyEnd[],
  segments: readonly DebateMediaTurnSegment[],
  playheadMs: number
): EarlyEndCue | null {
  const current = earlyEnds.find(entry => playheadMs >= entry.startMs && playheadMs < entry.endMs + EARLY_END_HOLD_MS);
  if (!current) return null;
  const ended = segments.find(segment => segment.turn_index === current.turnIndex);
  const next = segments.find(segment => segment.turn_index === current.nextTurnIndex);
  if (!ended || !next) return null;
  return { endedSlot: ended.participant_slot, nextSlot: next.participant_slot };
}

/**
 * Whether the playhead is somewhere nobody holds a turn: a break, from its pick window on, or an
 * early end's quiet. Nothing there is meant to be heard or captioned. Mostly that is already so,
 * because these lie between turn segments; an older render's lead-in is the exception, kept at the
 * front of the next turn.
 */
export function silentAt(breaks: PlaybackBreaks, playheadMs: number) {
  return (
    breaks.breaks.some(entry => playheadMs >= entry.decidingStartMs && playheadMs < entry.endMs) ||
    breaks.earlyEnds.some(entry => playheadMs >= entry.startMs && playheadMs < entry.endMs)
  );
}

/** Where the last break ends. A final End's reveal plays after the last turn, so the video runs on past it. */
export function breaksEndMs(breaks: readonly PlayerBreak[]) {
  return breaks.reduce((latest, entry) => Math.max(latest, entry.endMs), 0);
}

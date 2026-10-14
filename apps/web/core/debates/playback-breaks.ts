import type {
  Debate,
  DebateMediaResponse,
  DebateMediaRoundPick,
  DebateMediaTurnSegment,
  DebateParticipant,
  OpenRoundPick,
  ParticipantSlot,
} from './api';
import { isOpenRoundsDebate, openRoundsRequiredRebuttalRounds } from './open-rounds';
import type { PlaybackClock } from './playback-clock';

/**
 * The breaks between Open rounds in a published debate (GEO-3277), on the web player's clock.
 *
 * The player plays the raw recordings, where every break runs at its real length: the pick window
 * after a round, then the reveal and the opener's count-in, or a required round's lead-in, eight to
 * twelve seconds of people looking at their screens. So the player plays only the first couple of
 * seconds of each, silent (nobody holds a turn; both mics are open between rounds since #2838),
 * under the approved "stamps" graphic — "Keep debating?", each pick stamped onto its debater, then
 * a banner with the next round or "That's a wrap" — and then cuts to the next speaker, the graphic
 * covering the jump (GEO-3277). The cue is a function of the playhead, like `round-cues.ts`, so a
 * viewer who scrubs in finds it where it would be.
 */

/** How long "Ended early" stays up after the next speaker's first word. */
export const EARLY_END_HOLD_MS = 700;

/**
 * How long a break shows only its dim before anything moves. The player learns where the playhead is
 * about four times a second, so its first sample of a break lands up to a quarter of a second in;
 * motion that started at once lost its opening, which made the banner seem to appear and roll out.
 */
export const BREAK_SETTLE_MS = 300;

/** How long "Keep debating?" is up before the first pick is stamped. */
export const BREAK_QUESTION_MS = 800;

/** How long after the first stamp the second lands. */
export const BREAK_STAMP_GAP_MS = 280;

/** When the banner wipes in after a pick: both stamps landed and settled. */
export const BREAK_BANNER_AT_MS = BREAK_SETTLE_MS + BREAK_QUESTION_MS + 750;

/**
 * How much of each break the player plays before cutting to what follows it: about two seconds,
 * close to the rendered video's own catch-ups (1.6 s, 2.4 s and 2 s), and long enough for each step
 * to read. The final End's holds "That's a wrap" a little longer, since nothing has to start after it.
 */
export const BREAK_PLAYED_MS: Record<'lead_in' | 'extend' | 'final_end', number> = {
  lead_in: BREAK_SETTLE_MS + 2_100,
  extend: BREAK_BANNER_AT_MS + 1_300,
  final_end: BREAK_BANNER_AT_MS + 1_500,
};

/** A debater as the break graphics name them: their first name, which keeps the banner to one line. */
export function breakFirstName(participant: Pick<DebateParticipant, 'display_name'> | null | undefined) {
  return participant?.display_name?.trim().split(/\s+/)[0] || 'Debater';
}

/** The banner's type at its largest and smallest, as a share of the player's width. */
export const BANNER_MAX_CQW = 7;
export const BANNER_MIN_CQW = 4;
/** The width the banner's line may take, inside its padding. */
const BANNER_LINE_CQW = 88;
/** Calibre Bold's average uppercase advance with the banner's tracking, in em. Measured off the player. */
const BANNER_CHAR_EM = 0.6;

/**
 * The banner's line and the size that keeps it on one: a name in a two-line banner is the thing
 * that breaks it. The type shrinks to fit, down to `BANNER_MIN_CQW`; a first name too long even for
 * that is cut with an ellipsis. Sized by character count rather than measured, so it is the same on
 * every device and before the font loads.
 */
export function fitBannerLine(line: (name: string) => string, name: string): { text: string; fontCqw: number } {
  const sizeFor = (text: string) => BANNER_LINE_CQW / (text.length * BANNER_CHAR_EM);
  const full = line(name);
  if (sizeFor(full) >= BANNER_MIN_CQW) return { text: full, fontCqw: Math.min(BANNER_MAX_CQW, sizeFor(full)) };
  const maxChars = Math.floor(BANNER_LINE_CQW / (BANNER_MIN_CQW * BANNER_CHAR_EM));
  const room = Math.max(1, maxChars - line('').length - 1);
  return { text: line(`${name.slice(0, room)}…`), fontCqw: BANNER_MIN_CQW };
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

export type BreakCue = {
  kind: PlayerBreak['kind'];
  /** How far into the played stretch the playhead is; past it, only a scrub or a pause, it holds at the end. */
  elapsedMs: number;
  /** The played stretch: how long the graphic runs before the player cuts. */
  playedMs: number;
  /** Each debater's pick for the round that ended; `null` for a lead-in, where nobody picked. */
  picks: BreakPicks | null;
  /** The round the break leads into, or `null` after the final End. */
  nextRoundIndex: number | null;
};

/** What the player shows at the playhead, or `null` outside every break. */
export function breakCueAt(
  breaks: readonly PlayerBreak[],
  picks: readonly DebateMediaRoundPick[],
  playheadMs: number
): BreakCue | null {
  const current = breaks.find(entry => playheadMs >= entry.decidingStartMs && playheadMs < entry.endMs);
  if (!current) return null;
  const playedMs = playedLengthMs(current);
  return {
    kind: current.kind,
    elapsedMs: Math.min(playheadMs - current.decidingStartMs, playedMs),
    playedMs,
    picks: current.kind === 'lead_in' ? null : finalPicks(picks, current.roundIndex),
    nextRoundIndex: current.nextRoundIndex,
  };
}

/** How much of a break plays: its share, or all of it when it is shorter than that. */
function playedLengthMs(entry: PlayerBreak) {
  return Math.min(BREAK_PLAYED_MS[entry.kind], entry.endMs - entry.decidingStartMs);
}

export type BreakCut = {
  /** When to cut: the end of the played stretch at the front of the break, or of an early end's quiet. */
  atMs: number;
  /** Where to: the next turn, or the end of the debate after the final End. */
  toMs: number;
};

/**
 * Every cut the player makes, in order. A break plays its first couple of seconds under its graphic
 * and cuts to what follows it; an early end's quiet, from the last word of the turn that ended to
 * the next speaker's first, is cut straight away, as the rendered video cuts it.
 */
export function breakCuts(breaks: PlaybackBreaks): BreakCut[] {
  return [
    ...breaks.breaks.map(entry => ({ atMs: entry.decidingStartMs + playedLengthMs(entry), toMs: entry.endMs })),
    ...breaks.earlyEnds.map(entry => ({ atMs: entry.startMs, toMs: entry.endMs })),
  ]
    .filter(cut => cut.toMs > cut.atMs)
    .sort((a, b) => a.atMs - b.atMs);
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

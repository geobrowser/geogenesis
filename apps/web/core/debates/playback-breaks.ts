import { firstName } from '~/partials/profile/claim-response-tag';

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

/**
 * The breaks between Open rounds in a published debate (GEO-3277), on the web player's clock.
 *
 * The player plays the raw recordings, where every break runs at its real length: the pick window
 * after a round, then the reveal and the opener's count-in, or a required round's lead-in, eight to
 * twelve seconds of people looking at their screens. The player keeps a couple of seconds around
 * an edit in the middle of the round title's hold, silent (nobody holds a turn; both mics are open
 * between rounds since #2838). The frame blend finishes under the title before it fades into the
 * next speaker; a final "That's a wrap" holds through the end-card handoff (GEO-3277).
 * The cue is a function of the playhead, like `round-cues.ts`, so a
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

/** Recording room only: how long after the first stamp the second lands. */
export const BREAK_STAMP_GAP_MS = 280;

/**
 * How much of each break the player keeps around its edit: about two seconds,
 * with the same title-only pacing for required and optional rounds. The final End holds
 * "That's a wrap" a little longer, since nothing has to start after it.
 */
export const BREAK_PLAYED_MS: Record<'lead_in' | 'extend' | 'final_end', number> = {
  lead_in: BREAK_SETTLE_MS + 2_100,
  extend: BREAK_SETTLE_MS + 2_100,
  final_end: BREAK_SETTLE_MS + 2_300,
};

/** A debater's first name for the early-end next-speaker label. */
export function breakFirstName(participant: Pick<DebateParticipant, 'display_name'> | null | undefined) {
  return firstName(participant?.display_name) ?? 'Debater';
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
type PlayerEarlyEnd = {
  turnIndex: number;
  nextTurnIndex: number;
  startMs: number;
  endMs: number;
  /** Who ended their turn early, and who speaks next; null where the media lacks either turn. */
  endedSlot: ParticipantSlot | null;
  nextSlot: ParticipantSlot | null;
};

export type PlaybackBreaks = {
  breaks: PlayerBreak[];
  earlyEnds: PlayerEarlyEnd[];
  picks: DebateMediaRoundPick[];
};

export const NO_PLAYBACK_BREAKS: PlaybackBreaks = { breaks: [], earlyEnds: [], picks: [] };

/**
 * Every break and early end in a debate, on the player's clock: the raw recordings'.
 *
 * `segments` must already be on that clock (`turnOnRecordings`). A condensed render (GEO-3276)
 * lists its breaks and early ends with their source positions (GEO-3293). A break's deciding starts
 * where the round it follows ended, which is the end of that round's last turn. An older render lists only its kept Extend reveals, and keeps
 * a required round's lead-in at the front of that round's first turn, before its countdown, which is
 * where it is found here.
 */
export function playbackBreaksFrom(
  debate: Pick<Debate, 'open_rounds'>,
  media: Pick<DebateMediaResponse, 'condensed_breaks' | 'early_end_gaps' | 'round_results' | 'round_picks'> | undefined,
  segments: readonly DebateMediaTurnSegment[]
): PlaybackBreaks {
  // Open rounds only, for now: a fixed-format debate plays as it always has, even if its media
  // carries an early-end gap.
  if (!media || !isOpenRoundsDebate(debate)) return NO_PLAYBACK_BREAKS;

  const slotOfTurn = (turnIndex: number) =>
    segments.find(segment => segment.turn_index === turnIndex)?.participant_slot ?? null;

  // The round ended when its last turn did; the pick window runs from there. Falls back to the
  // break's own start, which is where a render that never cut the window put it.
  const roundEndMs = (roundIndex: number, fallbackMs: number) =>
    segments.find(segment => segment.turn_index === roundIndex * 2 + 1)?.output_end_ms ?? fallbackMs;

  const breaks: PlayerBreak[] = (media.condensed_breaks ?? []).map(entry => ({
    kind: entry.kind,
    roundIndex: entry.round_index,
    nextRoundIndex: entry.next_round_index ?? null,
    decidingStartMs:
      entry.kind === 'lead_in' ? entry.source_start_ms : roundEndMs(entry.round_index, entry.source_start_ms),
    startMs: entry.source_start_ms,
    endMs: entry.source_end_ms,
  }));

  for (const result of media.round_results ?? []) {
    if (breaks.some(entry => entry.kind === 'extend' && entry.roundIndex === result.round_index)) continue;
    breaks.push({
      kind: 'extend',
      roundIndex: result.round_index,
      nextRoundIndex: result.round_index + 1,
      decidingStartMs: roundEndMs(result.round_index, result.source_start_ms),
      startMs: result.source_start_ms,
      endMs: result.source_end_ms,
    });
  }

  // `debate` is Open rounds by now: the early return above saw to that.
  if ((debate.open_rounds.required_round_lead_in_ms ?? 0) > 0) {
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
      endedSlot: slotOfTurn(gap.turn_index),
      nextSlot: slotOfTurn(gap.next_turn_index),
    })),
    picks: media.round_picks ?? [],
  };
}

export type BreakPicks = Record<ParticipantSlot, OpenRoundPick | null>;

export type BreakCue = {
  kind: PlayerBreak['kind'];
  /** Progress through the kept footage; the omitted middle holds at the cut's progress on a scrub. */
  elapsedMs: number;
  /** Total kept duration, including the footage on both sides of a mid-title cut. */
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
    elapsedMs: breakElapsedMs(current, playheadMs),
    playedMs,
    picks: current.kind === 'lead_in' ? null : finalPicks(picks, current.roundIndex),
    nextRoundIndex: current.nextRoundIndex,
  };
}

/** Whether the banner is across the seam, including its hold across the mid-title edit. */
export function breakBannerShown(cue: BreakCue | null) {
  return cue !== null && cue.elapsedMs >= BREAK_SETTLE_MS;
}

/** How much of a break plays: its share, or all of it when it is shorter than that. */
function playedLengthMs(entry: PlayerBreak) {
  return Math.min(BREAK_PLAYED_MS[entry.kind], entry.endMs - entry.decidingStartMs);
}

function cutForBreak(entry: PlayerBreak): BreakCut {
  const playedMs = playedLengthMs(entry);
  // Keep half the announcement on either side of the edit. The incoming frame is still in the
  // silent count-in, so the blend finishes under the held title without hiding any spoken words.
  // A final wrap has no incoming round and keeps its existing end-card handoff.
  const beforeMs = entry.kind === 'final_end' ? playedMs : playedMs / 2;
  return { atMs: entry.decidingStartMs + beforeMs, toMs: entry.endMs - (playedMs - beforeMs) };
}

function breakElapsedMs(entry: PlayerBreak, playheadMs: number) {
  const cut = cutForBreak(entry);
  const skippedMs = Math.max(0, Math.min(playheadMs - cut.atMs, cut.toMs - cut.atMs));
  return Math.min(playedLengthMs(entry), playheadMs - entry.decidingStartMs - skippedMs);
}

/** The announcement's media clock, continuous across the automatic edit in the middle of its hold. */
export function breakAnimationPositionMs(breaks: readonly PlayerBreak[], playheadMs: number) {
  const current = breaks.find(entry => playheadMs >= entry.decidingStartMs && playheadMs < entry.endMs);
  return current ? current.decidingStartMs + breakElapsedMs(current, playheadMs) : playheadMs;
}

export type BreakCut = {
  /** When to cut: midway through a round title's hold, or at an early end's quiet. */
  atMs: number;
  /** Where to: the silent tail before the next turn, or the end after the final End. */
  toMs: number;
};

/**
 * Every cut the player makes, in order. Round breaks retain the front and tail of the silence,
 * cutting midway through the announcement so the frame blend finishes before its exit. An early
 * end's quiet, from the last word of the turn that ended to
 * the next speaker's first, is cut straight away, as the rendered video cuts it.
 */
export function breakCuts(breaks: PlaybackBreaks): BreakCut[] {
  return [
    ...breaks.breaks.map(cutForBreak),
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
  /** The cue's playhead clock, so delayed labels survive pauses and scrubs. */
  ageMs: number;
  durationMs: number;
};

/** "Ended early" and whose turn it is, over an early end's quiet and a moment past it. */
export function earlyEndCueAt(earlyEnds: readonly PlayerEarlyEnd[], playheadMs: number): EarlyEndCue | null {
  const current = earlyEnds.find(entry => playheadMs >= entry.startMs && playheadMs < entry.endMs + EARLY_END_HOLD_MS);
  if (!current?.endedSlot || !current.nextSlot) return null;
  return {
    endedSlot: current.endedSlot,
    nextSlot: current.nextSlot,
    ageMs: playheadMs - current.startMs,
    durationMs: current.endMs + EARLY_END_HOLD_MS - current.startMs,
  };
}

/**
 * The debater with the last word: the speaker of a round's closing turn when a pick follows it, for
 * as long as that turn runs. In the design mockup the player tags them "Last word" (GEO-3277).
 * `segments` on the player's clock.
 */
export function lastWordSlotAt(
  breaks: PlaybackBreaks,
  segments: readonly DebateMediaTurnSegment[],
  playheadMs: number
): ParticipantSlot | null {
  const turn = segments.find(segment => playheadMs >= segment.output_start_ms && playheadMs < segment.output_end_ms);
  if (!turn || turn.turn_index % 2 !== 1) return null;
  const round = (turn.turn_index - 1) / 2;
  const picked = breaks.breaks.some(entry => entry.kind !== 'lead_in' && entry.roundIndex === round);
  return picked ? turn.participant_slot : null;
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

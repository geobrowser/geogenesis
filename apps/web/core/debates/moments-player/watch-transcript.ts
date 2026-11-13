import type { DebateTranscriptResponse, ParticipantSlot } from '../api';
import { groupTurns, transcriptSpans } from '../transcript-lines';
import { type DebateMoment, type SlotNames, debateTimeForMoment } from './debate-moments';
import type { MomentsPlayerPosition, MomentsSpeaker } from './debate-moments-player';

/**
 * The Best debates watch popup's transcript (GEO-3728), pure so the lookups are tested alone.
 *
 * Two views of one debate, both on the player's clock:
 * - **Moments**: the reel being played, one block per moment, its lines the clip's own caption cues
 *   (timed from the clip file's start). It is the reel itself, so a re-cut reel (GEO-3614) reads as
 *   what it now plays.
 * - **Full debate**: geo-chat's transcript, by speaker turn. Its bare `start_ms` is on the rendered
 *   video's clock, which the player's full debate (`final_video`) plays, so no clock conversion:
 *   `recording-clock.ts` is for players of the raw recordings.
 */

/** One pressable line: where it starts on its own clock (a clip's, or the full debate's). */
export type WatchLine = { key: string; startMs: number; text: string };

/** Lines said by one debater: a moment, or a turn of the full debate. */
export type WatchBlock = {
  key: string;
  slot: ParticipantSlot | null;
  /** The moment it is, in play order; null for a turn of the full debate. */
  momentIndex: number | null;
  /** Where the block starts in the full debate, when known: shown beside a turn. */
  debateStartMs: number | null;
  lines: WatchLine[];
};

/** A cue or line as read: no stray spaces inside or around it, so joined lines read as prose. */
export function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

const momentLineKey = (moment: number, cue: number) => `m${moment}:${cue}`;
const fullLineKey = (line: number) => `f${line}`;

/**
 * The reel as blocks, in play order: moment `i`'s block is `blocks[i]`. The popup shows one at a
 * time, the moment playing (Preston, 13 Nov).
 */
export function momentBlocks(moments: readonly DebateMoment[]): WatchBlock[] {
  return moments.map((moment, i) => ({
    key: `m${i}`,
    slot: moment.participantSlot === 1 || moment.participantSlot === 2 ? moment.participantSlot : null,
    momentIndex: i,
    debateStartMs: moment.cutStartMs,
    lines: moment.captions.flatMap((cue, c) => {
      const text = cleanText(cue.text);
      return text ? [{ key: momentLineKey(i, c), startMs: cue.startMs, text }] : [];
    }),
  }));
}

/** The full debate's lines (sentences, else segments) in time order, grouped into turns. */
export function fullDebateBlocks(transcript: DebateTranscriptResponse | undefined): WatchBlock[] {
  const lines = transcriptSpans(transcript)
    .map(span => ({ slot: span.participant_slot, start: span.start_ms, text: cleanText(span.text) }))
    .filter(line => line.text.length > 0)
    .sort((a, b) => a.start - b.start)
    .map((line, index) => ({ ...line, key: fullLineKey(index) }));
  return groupTurns(lines).map(turn => ({
    key: turn[0].key,
    slot: turn[0].slot === 1 || turn[0].slot === 2 ? turn[0].slot : null,
    momentIndex: null,
    debateStartMs: turn[0].start,
    lines: turn.map(line => ({ key: line.key, startMs: line.start, text: line.text })),
  }));
}

/**
 * The line being spoken at `atMs`: the last one starting at or before it, so the highlight holds
 * through the gaps between lines rather than blinking off. Null before the first.
 */
export function lineAt(lines: readonly WatchLine[], atMs: number): WatchLine | null {
  let found: WatchLine | null = null;
  for (const line of lines) {
    if (line.startMs > atMs) break;
    found = line;
  }
  return found;
}

/** The highlighted line in each view for where the player is. */
export function highlightedLines(
  position: MomentsPlayerPosition | null,
  moments: readonly DebateMoment[],
  reel: readonly WatchBlock[],
  full: readonly WatchBlock[]
): { moments: string | null; full: string | null } {
  if (!position) return { moments: null, full: null };
  const fullLines = full.flatMap(block => block.lines);
  if (position.mode === 'full') return { moments: null, full: lineAt(fullLines, position.fullMs)?.key ?? null };
  const moment = moments[position.index];
  const debateMs = moment ? debateTimeForMoment(moment, position.clipMs) : null;
  return {
    moments: lineAt(reel[position.index]?.lines ?? [], position.clipMs)?.key ?? null,
    full: debateMs === null ? null : (lineAt(fullLines, debateMs)?.key ?? null),
  };
}

/**
 * Who said a block: the debater the debate names in that slot, else the name the reel's turns give
 * it, else "Debater 1" / "Debater 2". Side only when the debate was read.
 */
export function blockSpeaker(
  slot: ParticipantSlot | null,
  speakers: { top: MomentsSpeaker | null; bottom: MomentsSpeaker | null } | null,
  slotNames: SlotNames
): BlockSpeaker | null {
  if (slot === null) return null;
  const speaker = slot === 1 ? speakers?.top : speakers?.bottom;
  if (speaker) return speaker;
  const name = slotNames[slot] ?? `Debater ${slot}`;
  return { name, side: null, avatarUrl: null, avatarSeed: name };
}

export type BlockSpeaker = Pick<MomentsSpeaker, 'name' | 'side' | 'avatarUrl' | 'avatarSeed'>;

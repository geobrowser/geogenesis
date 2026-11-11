import type { DebateMediaTurnSegment, DebateTranscriptSpan, ParticipantSlot } from '../api';
import { recordingSpanOf, renderedTimeOf, transcriptOnRecordings } from '../recording-clock';
import type { LiveReel, ManualClipBody } from './api';

/**
 * The moments editor's model of a reel (GEO-3671). Everything here is on one clock, the debate
 * player's (the recordings', `recording-clock.ts`), which is the clock the admin watches and the one
 * the reel is sent on (`clock: "player"`). The rendered video's times geo-chat serves are converted
 * on the way in.
 */

/** geo-chat's limits on a hand-picked reel (`MANUAL_MAX_CLIPS`, `MANUAL_CLIP_MAX_SECONDS`). */
export const MANUAL_MAX_CLIPS = 6;
export const MANUAL_CLIP_MAX_MS = 60_000;

/** A word on the player's clock. */
export type ReelWord = { slot: ParticipantSlot; start_ms: number; end_ms: number; text: string };

/**
 * A clip being edited, on the player's clock. `claim_index` is the claim it is sent with: the live
 * reel's link for a clip loaded from it, so a clip nobody touched keeps its claim when the reel is
 * published again, or the admin's pick. `null` leaves it to geo-chat (the speaker's closest claim).
 */
export type EditorClip = {
  key: string;
  start_ms: number;
  end_ms: number;
  claim_index: number | null;
  /** The claim the live reel links the clip to, shown until the admin picks another. */
  live_claim_text: string | null;
};

let clipKeySeed = 0;
export function newClipKey() {
  clipKeySeed += 1;
  return `clip-${clipKeySeed}`;
}

/**
 * The transcript's words on the player's clock, in time order. A word the render cut has no player
 * time and is left out, as the player leaves its line out (`transcriptOnRecordings`).
 */
export function playerWords(words: readonly DebateTranscriptSpan[] | undefined): ReelWord[] {
  return transcriptOnRecordings(words ?? [])
    .map(word => ({ slot: word.participant_slot, start_ms: word.start_ms, end_ms: word.end_ms, text: word.text }))
    .sort((a, b) => a.start_ms - b.start_ms || a.end_ms - b.end_ms);
}

/** The words a clip plays with their captions: those said wholly inside it, as geo-chat counts them. */
export function wordsIn(words: readonly ReelWord[], startMs: number, endMs: number): ReelWord[] {
  return words.filter(word => word.start_ms >= startMs && word.end_ms <= endMs);
}

/**
 * Who a clip is of, as geo-chat decides it (`manual_moments`): the debater who says most of the
 * words wholly inside it, a tie going to the lower slot. `null` when nobody speaks in it.
 */
export function clipSpeaker(words: readonly ReelWord[], startMs: number, endMs: number): ParticipantSlot | null {
  const counts = new Map<ParticipantSlot, number>();
  for (const word of wordsIn(words, startMs, endMs)) counts.set(word.slot, (counts.get(word.slot) ?? 0) + 1);
  const ranked = [...counts].sort(([slotA, countA], [slotB, countB]) => countB - countA || slotA - slotB);
  return ranked[0]?.[0] ?? null;
}

export function clipQuote(words: readonly ReelWord[], startMs: number, endMs: number): string {
  return wordsIn(words, startMs, endMs)
    .map(word => word.text.trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * An edge moved off the middle of a word, outward, so the clip takes the whole word: a word crossing
 * an edge plays without its caption. A start goes to the word's start, an end to its end; an edge
 * in silence stays where it is.
 */
export function snapEdge(ms: number, words: readonly ReelWord[], edge: 'start' | 'end'): number {
  const crossing = words.find(word => word.start_ms < ms && ms < word.end_ms);
  if (!crossing) return ms;
  return edge === 'start' ? crossing.start_ms : crossing.end_ms;
}

/** The next word boundary from `ms` in `direction`: word starts for a start edge, word ends for an end. */
export function stepEdge(ms: number, words: readonly ReelWord[], edge: 'start' | 'end', direction: -1 | 1): number {
  const boundaries = words.map(word => (edge === 'start' ? word.start_ms : word.end_ms));
  if (direction > 0) {
    const next = boundaries.filter(at => at > ms).sort((a, b) => a - b)[0];
    return next ?? ms;
  }
  const previous = boundaries.filter(at => at < ms).sort((a, b) => b - a)[0];
  return previous ?? ms;
}

/** The live reel's cuts as editor clips, on the player's clock, each with the claim it plays for. */
export function clipsFromLiveReel(live: LiveReel, turns: readonly DebateMediaTurnSegment[]): EditorClip[] {
  return live.clips.map(clip => {
    const span = recordingSpanOf(clip.start_ms, clip.end_ms, turns);
    return {
      key: newClipKey(),
      ...span,
      claim_index: typeof clip.claim_index === 'number' ? clip.claim_index : null,
      live_claim_text: clip.claim_text ?? null,
    };
  });
}

/** A moment as the claims endpoint serves it: its words' range on the video's clock, not its cut. */
export type ServedMoment = { claim_index?: number | null; clip_start_ms?: number | null; clip_end_ms?: number | null };

/**
 * The served moments as editor clips, for a geo-chat that does not serve the live cuts yet. Their
 * times are the clips' words, not where they were cut, so they are approximate.
 */
export function clipsFromServedMoments(
  moments: readonly ServedMoment[],
  claims: readonly { text?: string | null }[],
  turns: readonly DebateMediaTurnSegment[]
): EditorClip[] {
  return moments.flatMap(moment => {
    if (typeof moment.clip_start_ms !== 'number' || typeof moment.clip_end_ms !== 'number') return [];
    const span = recordingSpanOf(moment.clip_start_ms, moment.clip_end_ms, turns);
    const claim = typeof moment.claim_index === 'number' ? claims[moment.claim_index] : undefined;
    const claimIndex = typeof moment.claim_index === 'number' ? moment.claim_index : null;
    return [{ key: newClipKey(), ...span, claim_index: claimIndex, live_claim_text: claim?.text ?? null }];
  });
}

/**
 * What stops geo-chat cutting a clip as given, found before it is sent: the same checks its worker
 * runs (`manual_moments`), so an admin hears about them on the clip rather than after a queue.
 *
 * Like the worker, it judges a clip by its words, not its edges: an edge a little into a stretch the
 * render cut or condensed (the live reel's own edge room does this) is trimmed by geo-chat to the
 * stretch its words are said in, not refused. Only words from two stretches are. Without words to
 * go by, the edges are all there is.
 */
export function clipProblems(
  clip: Pick<EditorClip, 'start_ms' | 'end_ms'>,
  words: readonly ReelWord[],
  turns: readonly DebateMediaTurnSegment[]
): string[] {
  if (!(clip.end_ms > clip.start_ms)) return ['It ends before it starts.'];
  const problems: string[] = [];
  if (clip.start_ms < 0) problems.push('It starts before the debate does.');
  if (clip.end_ms - clip.start_ms > MANUAL_CLIP_MAX_MS) problems.push('It runs over 60 s, the most a clip can.');
  const said = wordsIn(words, clip.start_ms, clip.end_ms);
  if (words.length > 0) {
    if (said.length === 0) problems.push('Nobody says a whole word in it.');
    else if (!inOneStretch(said[0].start_ms, said[said.length - 1].end_ms, turns)) {
      problems.push('Its words cross a cut in the video. Keep them inside one stretch.');
    }
    return problems;
  }
  const start = renderedTimeOf(clip.start_ms, turns, 'start');
  const end = renderedTimeOf(clip.end_ms, turns, 'end');
  if (start === null) problems.push('Its start falls in a stretch the video cut. Move it into a turn.');
  if (end === null) problems.push('Its end falls in a stretch the video cut. Move it into a turn.');
  // Both edges placed, but not the same distance apart on the video: the clip crosses a cut.
  if (start !== null && end !== null && Math.abs(end - start - (clip.end_ms - clip.start_ms)) > 1) {
    problems.push('It crosses a cut in the video. Keep it inside one stretch.');
  }
  return problems;
}

/**
 * Whether `startMs..endMs` on the player's clock lies in one stretch the render kept whole at real
 * speed (one turn's `source_*` span), as geo-chat requires of a clip's words. A render with one clock
 * has no cut to cross.
 */
function inOneStretch(startMs: number, endMs: number, turns: readonly DebateMediaTurnSegment[]) {
  if (!turns.some(turn => turn.source_start_ms !== undefined)) return true;
  return turns.some(
    turn =>
      turn.source_start_ms !== undefined &&
      turn.source_end_ms !== undefined &&
      startMs >= turn.source_start_ms &&
      endMs <= turn.source_end_ms
  );
}

/** What is wrong with the reel as a whole, rather than with one clip. */
export function reelProblems(clips: readonly Pick<EditorClip, 'start_ms' | 'end_ms'>[], words: readonly ReelWord[]) {
  const problems: string[] = [];
  if (clips.length === 0) problems.push('A reel needs at least one clip.');
  if (clips.length > MANUAL_MAX_CLIPS) problems.push(`A reel has at most ${MANUAL_MAX_CLIPS} clips.`);
  // geo-chat stores a clip's file by its words' range, so two clips with the same words cannot both be kept.
  const ranges = new Map<string, number>();
  clips.forEach((clip, index) => {
    const inside = wordsIn(words, clip.start_ms, clip.end_ms);
    if (inside.length === 0) return;
    const range = `${inside[0].start_ms}-${inside[inside.length - 1].end_ms}`;
    const earlier = ranges.get(range);
    if (earlier !== undefined) problems.push(`Clips ${earlier + 1} and ${index + 1} say exactly the same words.`);
    else ranges.set(range, index);
  });
  return problems;
}

/** The reel as geo-chat takes it: seconds on the player's clock, a claim only where one was picked. */
export function manualReelClips(clips: readonly EditorClip[]): ManualClipBody[] {
  return clips.map(clip => ({
    start: clip.start_ms / 1000,
    end: clip.end_ms / 1000,
    ...(clip.claim_index !== null && { claim_index: clip.claim_index }),
  }));
}

/** `m:ss.s`, as the editor shows a time. */
export function formatReelTime(ms: number): string {
  const tenths = Math.round(Math.max(0, ms) / 100);
  const minutes = Math.floor(tenths / 600);
  const seconds = (tenths % 600) / 10;
  return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`;
}

/** A typed time, `m:ss.s` or plain seconds, in ms; `null` when it is not one. */
export function parseReelTime(text: string): number | null {
  const trimmed = text.trim();
  const match = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(trimmed);
  if (!match) return null;
  const minutes = match[1] ? Number(match[1]) : 0;
  const seconds = Number(match[2]);
  if (match[1] && seconds >= 60) return null;
  return Math.round((minutes * 60 + seconds) * 1000);
}

export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

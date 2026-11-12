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
/** The shortest a clip is left by an edit that moves one edge past the other: a drag, a sentence. */
export const MIN_EDIT_CLIP_MS = 1_000;

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
  /**
   * Where an edge was last placed freely, with Alt (GEO-3672): the edge is free while it is still
   * there, so any other change to it (a snapped drag, a step, a typed time, a fix) makes it a word
   * edge again without having to say so. See `manualReel`.
   */
  free_start_ms?: number;
  free_end_ms?: number;
};

/** Whether a clip's edge sits where it was placed freely, with Alt. */
export function edgeIsFree(clip: EditorClip, edge: 'start' | 'end'): boolean {
  return edge === 'start' ? clip.free_start_ms === clip.start_ms : clip.free_end_ms === clip.end_ms;
}

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

/**
 * The live reel's cuts as editor clips, on the player's clock, each with the claim it plays for.
 * Both edges count as free: they are cuts, not word edges (`edgeIsFree`).
 */
export function clipsFromLiveReel(live: LiveReel, turns: readonly DebateMediaTurnSegment[]): EditorClip[] {
  return live.clips.map(clip => {
    const span = recordingSpanOf(clip.start_ms, clip.end_ms, turns);
    return {
      key: newClipKey(),
      ...span,
      // Each edge is already where geo-chat cut it, room and all, so an edge left alone is sent
      // where it is (`manualReel`). Without this, an edge an earlier publish cut `exact` would be
      // widened by the next publish that has no Alt edge of its own.
      free_start_ms: span.start_ms,
      free_end_ms: span.end_ms,
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
 * speed, as geo-chat requires of a clip's words. A render with one clock has no cut to cross.
 */
function inOneStretch(startMs: number, endMs: number, turns: readonly DebateMediaTurnSegment[]) {
  if (!turns.some(turn => turn.source_start_ms !== undefined)) return true;
  return realSpeedStretches(turns).some(stretch => startMs >= stretch.start_ms && endMs <= stretch.end_ms);
}

/**
 * The stretches the render plays at real speed, on the player's clock: turns that follow one another
 * on both clocks with nothing cut between them are one stretch, as geo-chat's edit plan merges them
 * (`recording_edit_plan`), so a debater's reply within an Open round is in the same stretch as the
 * turn it answers. A pick window, break or early end's quiet cut between two turns separates them.
 */
export function realSpeedStretches(turns: readonly DebateMediaTurnSegment[]): { start_ms: number; end_ms: number }[] {
  const placed = turns
    .flatMap(turn =>
      turn.source_start_ms !== undefined && turn.source_end_ms !== undefined
        ? [{ ...turn, source_start_ms: turn.source_start_ms, source_end_ms: turn.source_end_ms }]
        : []
    )
    .sort((a, b) => a.source_start_ms - b.source_start_ms);
  const stretches: { start_ms: number; end_ms: number; output_end_ms: number }[] = [];
  for (const turn of placed) {
    const last = stretches.at(-1);
    if (last && last.end_ms === turn.source_start_ms && last.output_end_ms === turn.output_start_ms) {
      last.end_ms = turn.source_end_ms;
      last.output_end_ms = turn.output_end_ms;
    } else {
      stretches.push({ start_ms: turn.source_start_ms, end_ms: turn.source_end_ms, output_end_ms: turn.output_end_ms });
    }
  }
  return stretches.map(({ start_ms, end_ms }) => ({ start_ms, end_ms }));
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

/** geo-chat's room for a cut beside its words (`clip_ranges.rs`): `CLIP_EDGE_PAD_MS`, `CLIP_WORD_CLEARANCE_MS`. */
const CLIP_EDGE_PAD_MS = 250;
const CLIP_WORD_CLEARANCE_MS = 60;

/** How far geo-chat moves an edge into a gap of `gap` ms beside its words (`edge_room`); `null` is no word. */
function edgeRoom(gap: number | null): number {
  if (gap === null) return CLIP_EDGE_PAD_MS;
  const clearance = Math.min(CLIP_EDGE_PAD_MS, Math.max(0, gap - CLIP_WORD_CLEARANCE_MS));
  return Math.min(clearance, Math.floor(gap / 2));
}

/**
 * Where geo-chat cuts a clip of a reel sent without `exact` (`manual_moments`, `Edges::Widen`): an
 * edge tight on the words widens into the quiet beside them, an edge set wider stays, and both are
 * trimmed to the real-speed stretch the words are said in. Also what an edge can be cut at with
 * `exact` (`trimmed`). `null` when no whole word is said in it: geo-chat refuses it either way.
 */
function geoChatCut(
  clip: Pick<EditorClip, 'start_ms' | 'end_ms'>,
  words: readonly ReelWord[],
  turns: readonly DebateMediaTurnSegment[]
) {
  // geo-chat reads only words with text (`speech_turns`): a blank one is not the word beside a gap.
  const spoken = words.filter(word => word.text.trim() !== '');
  const said = wordsIn(spoken, clip.start_ms, clip.end_ms);
  if (said.length === 0) return null;
  const first = Math.min(...said.map(word => word.start_ms));
  const last = Math.max(...said.map(word => word.end_ms));
  const before = spoken.filter(word => word.end_ms <= first).map(word => word.end_ms);
  const after = spoken.filter(word => word.start_ms >= last).map(word => word.start_ms);
  const paddedStart = first - edgeRoom(before.length > 0 ? first - Math.max(...before) : null);
  const paddedEnd = last + edgeRoom(after.length > 0 ? Math.min(...after) - last : null);
  const twoClocks = turns.some(turn => turn.source_start_ms !== undefined);
  const stretch = (twoClocks ? realSpeedStretches(turns) : []).find(
    candidate => first >= candidate.start_ms && last <= candidate.end_ms
  ) ?? { start_ms: 0, end_ms: Number.POSITIVE_INFINITY };
  const trim = (start: number, end: number) => ({
    start_ms: Math.max(start, stretch.start_ms, 0),
    end_ms: Math.min(end, stretch.end_ms),
  });
  return {
    widened: trim(Math.min(clip.start_ms, paddedStart), Math.max(clip.end_ms, paddedEnd)),
    trimmed: trim(clip.start_ms, clip.end_ms),
  };
}

/**
 * The reel as geo-chat takes it (GEO-3672, GEO-3683). An edge placed with Alt is a time picked by
 * ear, which geo-chat would widen by up to 250 ms when it sits in the quiet just beside a word: it
 * is sent `exact`, so it is cut where it was placed. `exact` is the whole reel's, and the editor's
 * other edges snap to words, where the widening is wanted (a word's first sound), so with `exact`
 * every other edge is sent where geo-chat would have widened it to, and every edge is trimmed to
 * the stretch the recordings can cut, as it would have been (`exact` refuses an edge outside it).
 * A reel whose free edges would not move, the usual case, is sent as before, without `exact`.
 */
export function manualReel(
  clips: readonly EditorClip[],
  words: readonly ReelWord[],
  turns: readonly DebateMediaTurnSegment[]
): { clips: ManualClipBody[]; exact?: true } {
  const cuts = clips.map(clip => geoChatCut(clip, words, turns));
  const freeEdgeWidens = clips.some((clip, index) => {
    const cut = cuts[index];
    if (!cut) return false;
    return (
      (edgeIsFree(clip, 'start') && cut.widened.start_ms < cut.trimmed.start_ms) ||
      (edgeIsFree(clip, 'end') && cut.widened.end_ms > cut.trimmed.end_ms)
    );
  });
  if (!freeEdgeWidens) return { clips: manualReelClips(clips) };
  const sent = clips.map((clip, index) => {
    const cut = cuts[index];
    if (!cut) return clip;
    let start = edgeIsFree(clip, 'start') ? cut.trimmed.start_ms : cut.widened.start_ms;
    let end = edgeIsFree(clip, 'end') ? cut.trimmed.end_ms : cut.widened.end_ms;
    // geo-chat checks a clip's length as it is sent: the room it would have added in the worker,
    // after that check, must not take a clip over the limit here. Give it back, end first. 1 ms
    // under, as the check is on seconds and 60 s apart can come out a hair over in floating point.
    const excess = end - start - (MANUAL_CLIP_MAX_MS - 1);
    if (excess > 0) {
      const fromEnd = Math.min(excess, end - cut.trimmed.end_ms);
      end -= fromEnd;
      start += Math.min(excess - fromEnd, cut.trimmed.start_ms - start);
    }
    return { ...clip, start_ms: start, end_ms: end };
  });
  return { clips: manualReelClips(sent), exact: true };
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

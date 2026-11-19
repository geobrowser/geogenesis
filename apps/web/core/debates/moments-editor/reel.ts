import type { DebateMediaTurnSegment, DebateTranscriptSpan, ParticipantSlot } from '../api';
import { openRoundIndexForTurn, openRoundNumber } from '../open-rounds';
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
   * Where an edge was last placed freely (a waveform drag), or where the live reel cut it (GEO-3672):
   * the edge is free while it is still there, so any other change to it (a transcript drag or step, a
   * typed time, a fix) makes it a word edge again without having to say so. See `manualReel`.
   */
  free_start_ms?: number;
  free_end_ms?: number;
};

/** Whether a clip's edge sits where it was placed freely, or where the live reel cut it. */
export function edgeIsFree(clip: EditorClip, edge: 'start' | 'end'): boolean {
  return edge === 'start' ? clip.free_start_ms === clip.start_ms : clip.free_end_ms === clip.end_ms;
}

let clipKeySeed = 0;
export function newClipKey() {
  clipKeySeed += 1;
  return `clip-${clipKeySeed}`;
}

/**
 * Whether a transcript span has any text: the one rule for blank tokens, shared by the editor's words
 * (`playerWords`) and its transcript sentences (`reelSentences`), so the two lists can't drift apart.
 */
export function isSpoken(span: { text: string }): boolean {
  return span.text.trim() !== '';
}

/**
 * The transcript's spoken words on the player's clock, in time order: the editor's one word list, the
 * words every check, count, snap and selection reads. A word the render cut has no player time and is
 * left out, as the player leaves its line out (`transcriptOnRecordings`). A blank token (no text) is
 * left out too (GEO-3767): geo-chat drops them before it counts or cuts anything (`speech_turns`), the
 * transcript shows none, and nobody hears them, so no clip is judged, measured or snapped by one.
 */
export function playerWords(words: readonly DebateTranscriptSpan[] | undefined): ReelWord[] {
  return transcriptOnRecordings(words ?? [])
    .filter(isSpoken)
    .map(word => ({ slot: word.participant_slot, start_ms: word.start_ms, end_ms: word.end_ms, text: word.text }))
    .sort((a, b) => a.start_ms - b.start_ms || a.end_ms - b.end_ms);
}

/** Whether `word` is said wholly inside `span`: what makes a clip play it with its caption, as geo-chat counts it. */
export function wordInSpan(word: ReelWord, span: { start_ms: number; end_ms: number }): boolean {
  return word.start_ms >= span.start_ms && word.end_ms <= span.end_ms;
}

/** The words a clip plays with their captions: those said wholly inside it, as geo-chat counts them. */
export function wordsIn(words: readonly ReelWord[], startMs: number, endMs: number): ReelWord[] {
  return words.filter(word => wordInSpan(word, { start_ms: startMs, end_ms: endMs }));
}

/** A sentence (or, from a transcript served without sentences, a line) on the player's clock. */
export type ReelSentence = { slot: ParticipantSlot; start_ms: number; end_ms: number; text: string };

/** How far a sentence must reach into a clip to count as in it, so a shared edge does not. */
const OVERLAP_MS = 150;

export function sentenceInClip(sentence: ReelSentence, clip: { start_ms: number; end_ms: number }) {
  return sentence.end_ms > clip.start_ms + OVERLAP_MS && sentence.start_ms < clip.end_ms - OVERLAP_MS;
}

const NO_SENTENCES: readonly ReelSentence[] = [];

/**
 * Who a clip is of, as geo-chat decides it (`manual_moments`): the debater who says most of the
 * words wholly inside it, a tie going to the lower slot. `null` when nobody speaks in it. The words
 * are `playerWords`, which has no blank tokens, as geo-chat counts them (`speech_turns`). The one rule for a clip's speaker: the timeline, the warnings, the claim kept on an edit and
 * the transcript's selection toolbar all ask this (GEO-3767).
 *
 * A transcript without word timings (`word_timing: false`) has no words to count, only its
 * sentences (`reelSentences`): then the clip is of the debater whose sentences take up most of it,
 * a tie going to the lower slot. Where there are words, the sentences are never read.
 */
export function clipSpeaker(
  words: readonly ReelWord[],
  startMs: number,
  endMs: number,
  sentences: readonly ReelSentence[] = NO_SENTENCES
): ParticipantSlot | null {
  const counts = new Map<ParticipantSlot, number>();
  if (words.length === 0) {
    for (const sentence of sentences) {
      if (!sentenceInClip(sentence, { start_ms: startMs, end_ms: endMs })) continue;
      const overlap = Math.min(sentence.end_ms, endMs) - Math.max(sentence.start_ms, startMs);
      counts.set(sentence.slot, (counts.get(sentence.slot) ?? 0) + overlap);
    }
  } else {
    for (const word of wordsIn(words, startMs, endMs)) {
      counts.set(word.slot, (counts.get(word.slot) ?? 0) + 1);
    }
  }
  const ranked = [...counts].sort(([slotA, countA], [slotB, countB]) => countB - countA || slotA - slotB);
  return ranked[0]?.[0] ?? null;
}

/**
 * What a clip says: its whole words, or, from a transcript without word timings, the text of the
 * sentences it reaches into (`sentenceInClip`, as the side transcript marks them).
 */
export function clipQuote(
  words: readonly ReelWord[],
  startMs: number,
  endMs: number,
  sentences: readonly ReelSentence[] = NO_SENTENCES
): string {
  const spans =
    words.length === 0
      ? sentences.filter(sentence => sentenceInClip(sentence, { start_ms: startMs, end_ms: endMs }))
      : wordsIn(words, startMs, endMs);
  return spans
    .map(span => span.text.trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * An edge moved off the middle of a word, outward, so the clip takes the whole word: a word crossing
 * an edge plays without its caption. A start goes to the word's start, an end to its end; an edge
 * in silence stays where it is. In crosstalk the new spot can be inside another word, so it keeps
 * moving until no word holds it (GEO-3768).
 */
export function snapEdge(ms: number, words: readonly ReelWord[], edge: 'start' | 'end'): number {
  let at = ms;
  for (;;) {
    const crossing = words.filter(word => word.start_ms < at && at < word.end_ms);
    if (crossing.length === 0) return at;
    // Each pass moves strictly outward, so it ends.
    at =
      edge === 'start'
        ? Math.min(...crossing.map(word => word.start_ms))
        : Math.max(...crossing.map(word => word.end_ms));
  }
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
export function inOneStretch(startMs: number, endMs: number, turns: readonly DebateMediaTurnSegment[]) {
  return stretchesOrWhole(turns, Number.POSITIVE_INFINITY).some(
    stretch => startMs >= stretch.start_ms && endMs <= stretch.end_ms
  );
}

/**
 * The stretches the render plays at real speed (`realSpeedStretches`), or, for a fixed-format
 * render, whose turns carry no `source_*` times because the video and the recordings share a clock,
 * the whole debate as one: it cut nothing, so nothing in it is a cut.
 */
export function stretchesOrWhole(
  turns: readonly DebateMediaTurnSegment[],
  durationMs: number
): { start_ms: number; end_ms: number }[] {
  if (!turns.some(turn => turn.source_start_ms !== undefined)) return [{ start_ms: 0, end_ms: durationMs }];
  return realSpeedStretches(turns);
}

/** What a run of transcript words makes as a clip, or why it can't be one (GEO-3766). */
export type SelectionClip =
  | {
      ok: true;
      start_ms: number;
      end_ms: number;
      /** Who the clip is of: `clipSpeaker` of its edges, as the timeline shows it and geo-chat publishes it. */
      speaker: ParticipantSlot;
      /** The other debater's words it plays too: more than none makes it an exchange. */
      otherWords: number;
    }
  | { ok: false; reason: 'no-words' | 'crosses-cut' };

/**
 * The clip a transcript selection makes (GEO-3766): from the first selected word's start to the last
 * one's end, given as indexes into `words` in either order. The edges are word edges like any other
 * in the editor: one that lands inside the other debater's word (crosstalk) moves out to take the
 * whole of it (`snapEdge`), and geo-chat adds its room beside the words when it cuts (`manualReel`).
 * Words of both debaters are allowed: the clip is of whoever says the most. Words from two stretches
 * the render kept apart are refused, as geo-chat refuses them.
 */
export function selectionToClip(
  words: readonly ReelWord[],
  from: number,
  to: number,
  turns: readonly DebateMediaTurnSegment[]
): SelectionClip {
  const lo = Math.max(0, Math.min(from, to));
  const hi = Math.min(words.length - 1, Math.max(from, to));
  const picked = words.slice(lo, hi + 1);
  if (picked.length === 0) return { ok: false, reason: 'no-words' };
  // Words are in start order, but a crosstalk word picked earlier can end after the last one picked.
  const start = snapEdge(Math.min(...picked.map(word => word.start_ms)), words, 'start');
  const end = snapEdge(Math.max(...picked.map(word => word.end_ms)), words, 'end');
  const said = wordsIn(words, start, end);
  if (said.length === 0) return { ok: false, reason: 'no-words' };
  const saidFrom = Math.min(...said.map(word => word.start_ms));
  const saidTo = Math.max(...said.map(word => word.end_ms));
  if (!inOneStretch(saidFrom, saidTo, turns)) return { ok: false, reason: 'crosses-cut' };
  // The clip's speaker as the editor shows it once made: `clipSpeaker` counts the same spoken words.
  const speaker = clipSpeaker(words, start, end)!;
  return {
    ok: true,
    start_ms: start,
    end_ms: end,
    speaker,
    otherWords: said.filter(word => word.slot !== speaker).length,
  };
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

/**
 * geo-chat's room for a cut beside its words (`clip_ranges.rs`): `CLIP_EDGE_PAD_MS`,
 * `CLIP_WORD_CLEARANCE_MS`, and `CLIP_OWN_WORD_CLEARANCE_MS` after a clip's last word (GEO-3710).
 */
const CLIP_EDGE_PAD_MS = 250;
const CLIP_WORD_CLEARANCE_MS = 60;
const CLIP_OWN_WORD_CLEARANCE_MS = 10;

/** How far geo-chat moves a start edge into a gap of `gap` ms before its words (`edge_room`); `null` is no word. */
function edgeRoom(gap: number | null): number {
  if (gap === null) return CLIP_EDGE_PAD_MS;
  const clearance = Math.min(CLIP_EDGE_PAD_MS, Math.max(0, gap - CLIP_WORD_CLEARANCE_MS));
  return Math.min(clearance, Math.floor(gap / 2));
}

/**
 * How far geo-chat moves an end edge past its last word (`clip_ranges::tail_clearance`, applied in
 * `clear_room`; GEO-3710), given the gaps to
 * that speaker's own next word and to the other debater's (`null`: no such word): 10 ms short of
 * the first, 60 ms short of the second, never past the middle of the gap to the nearer one.
 */
function tailClearance(ownGap: number | null, otherGap: number | null): number {
  const room = (gap: number | null, clearance: number) => (gap === null ? CLIP_EDGE_PAD_MS : gap - clearance);
  const nearest = Math.min(ownGap ?? Infinity, otherGap ?? Infinity);
  const tail = Math.min(
    room(ownGap, CLIP_OWN_WORD_CLEARANCE_MS),
    room(otherGap, CLIP_WORD_CLEARANCE_MS),
    Math.floor(nearest / 2)
  );
  return Math.min(CLIP_EDGE_PAD_MS, Math.max(0, tail));
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
  const said = wordsIn(words, clip.start_ms, clip.end_ms);
  if (said.length === 0) return null;
  const first = Math.min(...said.map(word => word.start_ms));
  // The clip's last word as geo-chat takes it (`manual_moments`): the one said last, by start then
  // slot (`speech_turns`), the later of two that tie (its sort is stable). Its end is where the words end and its speaker is who the end's room is
  // measured from: in an exchange it may be the other debater, and a word of theirs said inside it
  // is not the end.
  const lastWord = said.reduce((latest, word) =>
    word.start_ms > latest.start_ms || (word.start_ms === latest.start_ms && word.slot >= latest.slot) ? word : latest
  );
  const last = lastWord.end_ms;
  const lastSlot = lastWord.slot;
  const before = words.filter(word => word.end_ms <= first).map(word => word.end_ms);
  const ownAfter = words
    .filter(word => word.slot === lastSlot && word.start_ms >= last)
    .map(word => word.start_ms - last);
  // Another debater's word said across the end leaves no room (crosstalk).
  const otherAfter = words
    .filter(word => word.slot !== lastSlot && word.end_ms > last)
    .map(word => Math.max(0, word.start_ms - last));
  const paddedStart = first - edgeRoom(before.length > 0 ? first - Math.max(...before) : null);
  const paddedEnd =
    last +
    tailClearance(
      ownAfter.length > 0 ? Math.min(...ownAfter) : null,
      otherAfter.length > 0 ? Math.min(...otherAfter) : null
    );
  const stretch = stretchesOrWhole(turns, Number.POSITIVE_INFINITY).find(
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
 * is sent `exact`, so it is cut where it was placed, as is a live cut left alone. `exact` is the
 * whole reel's, and the editor's other edges snap to words, where the widening is wanted (a word's
 * first sound), so with `exact` every other edge is sent where geo-chat would have widened it to,
 * and every edge is trimmed to the stretch the recordings can cut, as it would have been (`exact`
 * refuses an edge outside it). A reel whose free edges would not move, the usual case, is sent as
 * before, without `exact`.
 */
export function manualReel(
  clips: readonly EditorClip[],
  words: readonly ReelWord[],
  turns: readonly DebateMediaTurnSegment[]
): { clips: ManualClipBody[]; exact?: true } {
  return manualReelWithCuts(clips, words, turns).reel;
}

/** `manualReel`, with the `geoChatCut` of each clip it worked out on the way, for `playedCuts`. */
function manualReelWithCuts(
  clips: readonly EditorClip[],
  words: readonly ReelWord[],
  turns: readonly DebateMediaTurnSegment[]
): { reel: { clips: ManualClipBody[]; exact?: true }; cuts: ReturnType<typeof geoChatCut>[] } {
  const cuts = clips.map(clip => geoChatCut(clip, words, turns));
  const freeEdgeWidens = clips.some((clip, index) => {
    const cut = cuts[index];
    if (!cut) return false;
    return (
      (edgeIsFree(clip, 'start') && cut.widened.start_ms < cut.trimmed.start_ms) ||
      (edgeIsFree(clip, 'end') && cut.widened.end_ms > cut.trimmed.end_ms)
    );
  });
  if (!freeEdgeWidens) return { reel: { clips: manualReelClips(clips) }, cuts };
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
  return { reel: { clips: manualReelClips(sent), exact: true }, cuts };
}

/**
 * What each clip of the reel will actually play, as geo-chat will cut it (GEO-3673), on the player's
 * clock: a reel sent without `exact` has each clip widened into the quiet beside its words
 * (`geoChatCut`); one sent `exact` is cut where `manualReel` sends it, which moves every snapped edge
 * of the reel out to where geo-chat would have widened it. `null` for a clip with no whole word,
 * which geo-chat refuses.
 */
export function playedCuts(
  clips: readonly EditorClip[],
  words: readonly ReelWord[],
  turns: readonly DebateMediaTurnSegment[]
): ({ start_ms: number; end_ms: number } | null)[] {
  const { reel, cuts } = manualReelWithCuts(clips, words, turns);
  if (!reel.exact) return cuts.map(cut => cut?.widened ?? null);
  return reel.clips.map((sent, index) =>
    cuts[index] ? { start_ms: Math.round(sent.start * 1000), end_ms: Math.round(sent.end * 1000) } : null
  );
}

/** `m:ss.s`, as the editor shows a time. */
export function formatReelTime(ms: number): string {
  const tenths = Math.round(Math.max(0, ms) / 100);
  const minutes = Math.floor(tenths / 600);
  const seconds = (tenths % 600) / 10;
  return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`;
}

/**
 * The debate's length to the whole second, as the player's transport and the lane's end both say it
 * (one rule, so they never differ by a second): down to the second, as a video player counts.
 */
export function formatWholeTime(ms: number): string {
  return formatReelTime(Math.floor(Math.max(0, ms) / 1000) * 1000).replace(/\.\d$/, '');
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

/**
 * Which round of the debate a clip is from, as the debate player numbers rounds (the opening is
 * Round 1, `openRoundNumber`): "Round 2", or "Rounds 2–3" for a clip that runs from one into the next.
 * A time belongs to the last turn that started at or before it on the player's clock, so a pause
 * between turns counts with the turn before it. `null` without turns.
 */
export function clipRoundLabel(
  clip: { start_ms: number; end_ms: number },
  turns: readonly DebateMediaTurnSegment[]
): string | null {
  if (turns.length === 0) return null;
  const starts = turns
    .map(turn => ({ at: turn.source_start_ms ?? turn.output_start_ms, index: turn.turn_index }))
    .sort((a, b) => a.at - b.at);
  // `inclusive` decides whether a turn starting exactly at `ms` counts: yes for a clip's start, no
  // for its end, so a clip ending where the next round begins stays in its own.
  const roundAt = (ms: number, inclusive: boolean) => {
    let turn = starts[0].index;
    for (const start of starts) {
      if (inclusive ? start.at <= ms : start.at < ms) turn = start.index;
      else break;
    }
    return openRoundNumber(openRoundIndexForTurn(turn));
  };
  const first = roundAt(clip.start_ms, true);
  const last = Math.max(first, roundAt(clip.end_ms, false));
  return first === last ? `Round ${first}` : `Rounds ${first}–${last}`;
}

/**
 * A clip picked from the transcript in the side panel (GEO-3773, the prototype's `rangeFromWord` +
 * `fitRange`): from the spoken word at or after `fromMs`, about `lengthMs` of one speaker's words in
 * one stretch the render kept whole, kept clear of the other clips (`others`). A start inside another
 * clip moves past it; an end that would run into the next clip stops before it. `null` when there
 * is no word to start on.
 */
export function clipFromWords(
  words: readonly ReelWord[],
  fromMs: number,
  lengthMs: number,
  turns: readonly DebateMediaTurnSegment[],
  others: readonly Pick<EditorClip, 'start_ms' | 'end_ms'>[]
): { start_ms: number; end_ms: number; speaker: ParticipantSlot } | null {
  const spoken = words.filter(isSpoken);
  const sorted = [...others].sort((a, b) => a.start_ms - b.start_ms);
  let at = spoken.findIndex(word => word.end_ms > fromMs);
  if (at < 0) return null;
  for (const other of sorted) {
    if (at >= 0 && spoken[at].start_ms >= other.start_ms - 50 && spoken[at].start_ms < other.end_ms) {
      at = spoken.findIndex(word => word.start_ms >= other.end_ms + 60);
    }
  }
  if (at < 0) return null;
  const first = spoken[at];
  const start = first.start_ms;
  let end = first.end_ms;
  for (let next = at + 1; next < spoken.length; next++) {
    const word = spoken[next];
    if (word.end_ms > start + lengthMs + 600 || word.slot !== first.slot || !inOneStretch(start, word.end_ms, turns))
      break;
    end = word.end_ms;
  }
  const following = sorted.find(other => other.start_ms > start);
  if (following && end > following.start_ms - 50) {
    const before = spoken.filter(word => word.start_ms >= start && word.end_ms <= following.start_ms - 50);
    end = before.length > 0 ? before[before.length - 1].end_ms : first.end_ms;
  }
  return { start_ms: start, end_ms: end, speaker: first.slot };
}

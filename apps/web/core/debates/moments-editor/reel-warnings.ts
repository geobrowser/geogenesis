import type { ParticipantSlot } from '../api';
import { type EditorClip, type ReelWord, clipSpeaker, formatReelTime, formatSeconds, wordsIn } from './reel';

/**
 * What makes a reel watchable, as the automatic picker is held to it (GEO-3672). None of it blocks
 * publishing: geo-chat takes a hand-picked reel of 1 to 6 clips of up to 60 s each. Severity follows
 * what geo-chat and extraction-api actually enforce on an automatic pick:
 *
 * - a clip aims for 10-18 s (`target_max_ms`) and is never over 22 s (`CLIP_MAX_MS`), so over 18 s
 *   is a warning and over 22 s is the stronger one;
 * - the reel aims under 70 s (Yaniv's target) and the picker's own soft limit is 4 × 18 = 72 s
 *   (`reel_max_ms`), which it only asks to be kept, so a long reel is a warning, never more;
 * - four clips, taking turns, is how every automatic reel is built;
 * - the picker trims "so", "and" and "but" off a clip's opening (`FILLER`, 101 of 372 story clips
 *   opened on one on 11 Nov).
 */
export const REEL_TARGET_MS = 70_000;
export const CLIP_TARGET_MAX_MS = 18_000;
export const CLIP_HARD_MAX_MS = 22_000;
/** The shortest a clip trimmed by a fix is left (`CLIP_MIN_MS`). */
export const CLIP_MIN_MS = 6_000;
export const REEL_CLIPS = 4;
const OPENING_FILLER = new Set(['so', 'and', 'but']);

export type ReelWarningFix =
  { label: string; kind: 'clips'; clips: EditorClip[]; select: number } | { label: string; kind: 'add-at-playhead' };

export type ReelWarning = {
  id: string;
  severity: 'warn' | 'bad';
  title: string;
  recommendation: string;
  fix: ReelWarningFix | null;
};

/** A word's text as a bare lower-case word: "So," is "so". */
function bare(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z']/g, '');
}

/**
 * Where to end a clip so it runs at most `maxMs`: the latest sentence end inside that, or failing one
 * the latest word end, never shorter than {@link CLIP_MIN_MS}. `null` when no word ends there.
 */
export function trimmedEnd(clip: Pick<EditorClip, 'start_ms' | 'end_ms'>, words: readonly ReelWord[], maxMs: number) {
  const ends = wordsIn(words, clip.start_ms, Math.min(clip.end_ms, clip.start_ms + maxMs)).filter(
    word => word.end_ms - clip.start_ms >= CLIP_MIN_MS
  );
  const sentenceEnds = ends.filter(word => /[.?!]["”']?$/.test(word.text.trim()));
  const pick = (sentenceEnds.length > 0 ? sentenceEnds : ends).at(-1);
  return pick ? pick.end_ms : null;
}

export function reelWarnings(
  clips: readonly EditorClip[],
  words: readonly ReelWord[],
  nameOf: (slot: ParticipantSlot | null) => string | null
): ReelWarning[] {
  const warnings: ReelWarning[] = [];
  const speakers = clips.map(clip => clipSpeaker(words, clip.start_ms, clip.end_ms));
  const length = (clip: EditorClip) => clip.end_ms - clip.start_ms;
  const withClip = (index: number, next: EditorClip) => clips.map((clip, at) => (at === index ? next : clip));

  const total = clips.reduce((sum, clip) => sum + length(clip), 0);
  if (total > REEL_TARGET_MS) {
    const longest = clips.reduce((best, clip, index) => (length(clip) > length(clips[best]) ? index : best), 0);
    const end =
      length(clips[longest]) > CLIP_TARGET_MAX_MS ? trimmedEnd(clips[longest], words, CLIP_TARGET_MAX_MS) : null;
    warnings.push({
      id: 'reel-length',
      severity: 'warn',
      title: `The reel runs ${formatSeconds(total)}, ${formatSeconds(total - REEL_TARGET_MS)} over the 70 s target`,
      recommendation: `Viewers drop off past about a minute. Trim the longest clips first: clip ${longest + 1} runs ${formatSeconds(length(clips[longest]))}.`,
      fix:
        end === null
          ? null
          : {
              label: `Trim clip ${longest + 1} to ${formatSeconds(end - clips[longest].start_ms)}`,
              kind: 'clips',
              clips: withClip(longest, { ...clips[longest], end_ms: end }),
              select: longest,
            },
    });
  }

  if (clips.length > REEL_CLIPS) {
    warnings.push({
      id: 'clip-count',
      severity: 'warn',
      title: `${clips.length} clips; reels are built for 4`,
      recommendation: 'Four clips, two per speaker, keep the reel near a minute. Remove the clip that adds least.',
      fix: null,
    });
  } else if (clips.length > 0 && clips.length < REEL_CLIPS) {
    warnings.push({
      id: 'clip-count',
      severity: 'warn',
      title: `Only ${clips.length} clip${clips.length === 1 ? '' : 's'}`,
      recommendation: 'Four clips give each side two turns. Add one from the transcript or at the playhead.',
      fix: { label: 'Add clip at playhead', kind: 'add-at-playhead' },
    });
  }

  speakers.forEach((speaker, index) => {
    if (index === 0 || speaker === null || speaker !== speakers[index - 1]) return;
    const swap = speakers.findIndex((other, at) => at > index && other !== null && other !== speaker);
    const swapped = [...clips];
    if (swap > 0) [swapped[index], swapped[swap]] = [swapped[swap], swapped[index]];
    warnings.push({
      id: `alternate-${index}`,
      severity: 'warn',
      title: `Clips ${index} and ${index + 1} are both ${nameOf(speaker) ?? 'the same speaker'}`,
      recommendation:
        'Alternating speakers keeps the back-and-forth: a viewer hears an answer to each point.' +
        (swap > 0 ? ` Swapping clip ${index + 1} with clip ${swap + 1} fixes it.` : ''),
      fix:
        swap > 0
          ? { label: `Swap clips ${index + 1} and ${swap + 1}`, kind: 'clips', clips: swapped, select: index }
          : null,
    });
  });

  clips.forEach((clip, index) => {
    if (length(clip) <= CLIP_TARGET_MAX_MS) return;
    const over = length(clip) > CLIP_HARD_MAX_MS;
    const end = trimmedEnd(clip, words, CLIP_TARGET_MAX_MS);
    warnings.push({
      id: `clip-length-${index}`,
      severity: over ? 'bad' : 'warn',
      title: `Clip ${index + 1} runs ${formatSeconds(length(clip))}`,
      recommendation:
        'Feed clips work best at 10–18 s' +
        (over ? '; an automatic pick is never over 22 s, and past that most viewers swipe away' : '') +
        '.' +
        (end === null ? '' : ` Ending it at ${formatReelTime(end)} makes it ${formatSeconds(end - clip.start_ms)}.`),
      fix:
        end === null
          ? null
          : {
              label: `Trim to ${formatSeconds(end - clip.start_ms)}`,
              kind: 'clips',
              clips: withClip(index, { ...clip, end_ms: end }),
              select: index,
            },
    });
  });

  clips.forEach((clip, index) => {
    const said = wordsIn(words, clip.start_ms, clip.end_ms);
    const opener = said[0];
    if (!opener || !OPENING_FILLER.has(bare(opener.text))) return;
    const next = said[1];
    const shown = opener.text.trim().replace(/[,.;:]+$/, '');
    warnings.push({
      id: `opener-${index}`,
      severity: 'warn',
      title: `Clip ${index + 1} opens on “${shown}”`,
      recommendation: `A clip that opens on “${shown}” sounds like it starts mid-thought. Start it on the next word.`,
      fix: next
        ? {
            label: `Start on “${next.text.trim()}”`,
            kind: 'clips',
            clips: withClip(index, { ...clip, start_ms: next.start_ms }),
            select: index,
          }
        : null,
    });
  });

  return warnings;
}

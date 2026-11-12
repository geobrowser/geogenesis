import { describe, expect, it } from 'vitest';

import type { EditorClip, ReelWord } from './reel';
import { draggedClip } from './reel-timeline';
import { endClipAt, reelSentences, sentenceInClip, startClipAt } from './reel-transcript';
import { reelWarnings, trimmedEnd } from './reel-warnings';

const word = (slot: 1 | 2, start: number, end: number, text = 'word'): ReelWord => ({
  slot,
  start_ms: start,
  end_ms: end,
  text,
});

const clip = (start: number, end: number): EditorClip => ({
  key: `${start}`,
  start_ms: start,
  end_ms: end,
  claim_index: null,
  live_claim_text: null,
});

/** One word a second for each speaker's stretch, a sentence ending every fifth word. */
function speech(slot: 1 | 2, fromMs: number, toMs: number): ReelWord[] {
  const words: ReelWord[] = [];
  for (let at = fromMs, n = 1; at + 800 <= toMs; at += 1_000, n += 1) {
    words.push(word(slot, at, at + 800, n % 5 === 0 ? 'end.' : 'word'));
  }
  return words;
}

const nameOf = (slot: 1 | 2 | null) => (slot === 1 ? 'Susan' : slot === 2 ? 'Urban' : null);

// Susan speaks 0-100 s, Urban 100-200 s, Susan 200-300 s, Urban 300-400 s.
const WORDS = [
  ...speech(1, 0, 100_000),
  ...speech(2, 100_000, 200_000),
  ...speech(1, 200_000, 300_000),
  ...speech(2, 300_000, 400_000),
];
const GOOD = [clip(10_000, 24_900), clip(110_000, 124_900), clip(210_000, 224_900), clip(310_000, 324_900)];

describe('reelWarnings (GEO-3672)', () => {
  it('has nothing to say about four alternating clips within 18 s, under 70 s', () => {
    expect(reelWarnings(GOOD, WORDS, nameOf)).toEqual([]);
  });

  it('warns about a clip over 18 s, more strongly over 22 s, and trims it to a sentence end', () => {
    const long = [GOOD[0], GOOD[1], clip(210_000, 230_000), clip(310_000, 335_000)];
    const warnings = reelWarnings(long, WORDS, nameOf);
    const twenty = warnings.find(w => w.id === 'clip-length-2')!;
    const twentyFive = warnings.find(w => w.id === 'clip-length-3')!;
    expect(twenty.severity).toBe('warn');
    expect(twentyFive.severity).toBe('bad');
    // The latest sentence end within 18 s of 310 s: the word at 324 s, ending 324.8 s.
    expect(twentyFive.fix).toMatchObject({ kind: 'clips', select: 3 });
    expect(twentyFive.fix?.kind === 'clips' && twentyFive.fix.clips[3].end_ms).toBe(324_800);
  });

  // A live reel's clip is a cut: its words plus clear room either side. The picker's 18 s and
  // geo-chat's 22 s are on the words, so a cut a little over them is an automatic pick within them.
  it('holds a clip to the limits by its words, not its cut', () => {
    const cuts = [clip(9_700, 28_200), GOOD[1], GOOD[2], clip(309_700, 332_300)];
    const warnings = reelWarnings(cuts, WORDS, nameOf);
    // 10.0-27.8 s of words in an 18.5 s cut.
    expect(warnings.find(w => w.id === 'clip-length-0')).toBeUndefined();
    // 310.0-331.8 s of words in a 22.6 s cut: over 18 s, not over 22 s.
    expect(warnings.find(w => w.id === 'clip-length-3')).toMatchObject({
      severity: 'warn',
      title: "Clip 4's words run 21.8 s",
    });
  });

  it('warns about a reel over 70 s, never as more than a warning, and trims its longest clip', () => {
    const long = [clip(10_000, 30_000), GOOD[1], clip(210_000, 228_000), clip(310_000, 328_000)];
    const warning = reelWarnings(long, WORDS, nameOf).find(w => w.id === 'reel-length')!;
    expect(warning.severity).toBe('warn');
    expect(warning.title).toBe('The reel runs 70.9 s, 0.9 s over the 70 s target');
    expect(warning.fix?.label).toBe('Trim clip 1 to 14.8 s');
  });

  it('warns about two clips in a row from one speaker and fixes it with a swap', () => {
    const repeated = [GOOD[0], GOOD[2], GOOD[1], GOOD[3]];
    const warning = reelWarnings(repeated, WORDS, nameOf).find(w => w.id.startsWith('alternate'))!;
    expect(warning.title).toBe('Clips 1 and 2 are both Susan');
    expect(warning.fix?.kind === 'clips' && warning.fix.clips).toEqual(GOOD);
  });

  it('warns about a reel that is not 4 clips, offering to add one when it is short', () => {
    expect(reelWarnings(GOOD.slice(0, 2), WORDS, nameOf).find(w => w.id === 'clip-count')).toMatchObject({
      title: 'Only 2 clips',
      fix: { kind: 'add-at-playhead' },
    });
    expect(
      reelWarnings([...GOOD, clip(20_000, 30_000)], WORDS, nameOf).find(w => w.id === 'clip-count')?.fix
    ).toBeNull();
  });

  it.each(['So', 'and', 'But,'])('warns about a clip opening on “%s” and starts it on the next word', opener => {
    const words = [word(1, 1_000, 1_300, opener), word(1, 1_400, 1_800, 'coffee'), ...WORDS.slice(20)];
    const warning = reelWarnings([clip(900, 9_000)], words, nameOf).find(w => w.id === 'opener-0')!;
    expect(warning.title).toBe(`Clip 1 opens on “${opener.replace(',', '')}”`);
    expect(warning.fix?.kind === 'clips' && warning.fix.clips[0].start_ms).toBe(1_400);
  });

  it('does not take “Sometimes” or “Andrew” for filler', () => {
    const words = [word(1, 1_000, 1_300, 'Sometimes'), word(1, 1_400, 1_800, 'Andrew')];
    expect(reelWarnings([clip(900, 1_900)], words, nameOf).filter(w => w.id.startsWith('opener'))).toEqual([]);
  });
});

describe('trimmedEnd', () => {
  it('prefers a sentence end, and never leaves the clip under 6 s', () => {
    expect(trimmedEnd(clip(10_000, 40_000), WORDS, 18_000)).toBe(24_800);
    expect(trimmedEnd(clip(10_000, 12_000), WORDS, 18_000)).toBeNull();
  });
});

describe('draggedClip (GEO-3672)', () => {
  const words = [word(1, 1_000, 1_400), word(1, 2_000, 2_400), word(1, 3_000, 3_400)];
  const drag = { start: 1_000, end: 3_400 };

  it('snaps a dragged edge off the middle of a word, outward', () => {
    expect(draggedClip({ ...drag, mode: 'start' }, 1_200, words, 10_000, false)).toEqual({
      start_ms: 2_000,
      end_ms: 3_400,
    });
    expect(draggedClip({ ...drag, mode: 'end' }, -1_200, words, 10_000, false)).toEqual({
      start_ms: 1_000,
      end_ms: 2_400,
    });
  });

  it('places an edge freely, to the tenth, with Alt held', () => {
    // And says where, so the edge is cut exactly there (`manualReel`).
    expect(draggedClip({ ...drag, mode: 'start' }, 1_234, words, 10_000, true)).toEqual({
      start_ms: 2_200,
      end_ms: 3_400,
      free_start_ms: 2_200,
    });
  });

  it('moves a clip whole, keeping its length, inside the debate', () => {
    expect(draggedClip({ ...drag, mode: 'move' }, 5_000, words, 7_000, true)).toEqual({
      start_ms: 4_600,
      end_ms: 7_000,
      free_start_ms: 4_600,
      free_end_ms: 7_000,
    });
    expect(draggedClip({ ...drag, mode: 'move' }, -5_000, words, 7_000, false)).toEqual({ start_ms: 0, end_ms: 2_400 });
  });

  // A move snaps both edges out to whole words: an end left mid-word plays that word uncaptioned.
  it('moves a clip so its end, too, takes a whole word', () => {
    const later = [...words, word(2, 4_000, 4_400)];
    expect(draggedClip({ ...drag, mode: 'move' }, 700, later, 10_000, false)).toEqual({
      start_ms: 1_700,
      end_ms: 4_400,
    });
    // With Alt held it keeps its length exactly.
    expect(draggedClip({ ...drag, mode: 'move' }, 700, later, 10_000, true)).toEqual({
      start_ms: 1_700,
      end_ms: 4_100,
      free_start_ms: 1_700,
      free_end_ms: 4_100,
    });
  });

  it('never trims a clip under a second', () => {
    expect(draggedClip({ ...drag, mode: 'end' }, -3_000, words, 10_000, true)).toEqual({
      start_ms: 1_000,
      end_ms: 2_000,
      free_end_ms: 2_000,
    });
  });
});

describe('the transcript picker (GEO-3672)', () => {
  const sentence = { slot: 1 as const, start_ms: 20_000, end_ms: 24_000, text: 'Coffee is fine.' };

  it('starts the clip at a sentence, its end following if it would come first', () => {
    expect(startClipAt(clip(10_000, 30_000), sentence)).toMatchObject({ start_ms: 20_000, end_ms: 30_000 });
    expect(startClipAt(clip(10_000, 15_000), sentence)).toMatchObject({ start_ms: 20_000, end_ms: 24_000 });
  });

  it('ends the clip at a sentence, its start following if it would come after', () => {
    expect(endClipAt(clip(10_000, 30_000), sentence)).toMatchObject({ start_ms: 10_000, end_ms: 24_000 });
    expect(endClipAt(clip(26_000, 30_000), sentence)).toMatchObject({ start_ms: 20_000, end_ms: 24_000 });
  });

  it('counts a sentence as in a clip only when it reaches into it, not when it shares an edge', () => {
    expect(sentenceInClip(sentence, clip(24_000, 30_000))).toBe(false);
    expect(sentenceInClip(sentence, clip(23_000, 30_000))).toBe(true);
  });

  it('reads the served sentences onto the player’s clock, or the lines without them', () => {
    const line = { participant_slot: 1 as const, start_ms: 130_000, end_ms: 131_000, text: 'Hi.' };
    expect(
      reelSentences({
        format: 'json',
        model_id: 'm',
        segments: [],
        sentences: [
          { ...line, source_start_ms: 136_400, source_end_ms: 137_400 },
          { ...line, start_ms: 120_500 },
        ],
      }).map(s => s.start_ms)
    ).toEqual([136_400]);
    expect(
      reelSentences({
        format: 'json',
        model_id: 'm',
        segments: [
          { ...line, id: 'a', position: true, position_label: '', sequence_index: 0, metadata: {}, created_at: '' },
        ],
      }).map(s => s.text)
    ).toEqual(['Hi.']);
  });
});

import { describe, expect, it } from 'vitest';

import type { DebateTranscriptResponse, DebateTranscriptSegment } from '../api';
import { type DebateMoment, decodeSlotNames } from './debate-moments';
import { blockSpeaker, fullDebateBlocks, highlightedLines, lineAt, momentBlocks } from './watch-transcript';

function moment(i: number, cutStartMs: number, slot: number | null, cues: [number, string][]): DebateMoment {
  return {
    id: `clip-${i}`,
    momentIndex: i,
    claimIndex: 0,
    claimText: null,
    participantSlot: slot,
    clipUrl: `https://chat.test/clip-${i}`,
    durationMs: 10_000,
    debateStartMs: cutStartMs + 250,
    debateEndMs: cutStartMs + 9_750,
    cutStartMs,
    cutEndMs: cutStartMs + 10_000,
    captions: cues.map(([startMs, text], c) => ({ startMs, endMs: cues[c + 1]?.[0] ?? 10_000, text })),
  };
}

// Play order is not time order: moment 1 comes from earlier in the debate than moment 0.
const REEL = [
  moment(0, 189_000, 2, [
    [0, 'It’s a real problem.'],
    [2_000, 'And it’s getting worse.'],
  ]),
  moment(1, 140_000, 1, [
    [250, 'For white Americans,'],
    [3_000, 'it’s sort of invisible.'],
  ]),
];

const segment = (start: number, slot: 1 | 2, text: string): DebateTranscriptSegment => ({
  id: `s${start}`,
  participant_slot: slot,
  position: slot === 1,
  position_label: '',
  sequence_index: 0,
  start_ms: start,
  end_ms: start + 1_000,
  text,
  metadata: {},
  created_at: '',
});

function transcript(parts: Partial<DebateTranscriptResponse>): DebateTranscriptResponse {
  return { format: 'json', model_id: 'm', segments: [], ...parts };
}

describe('the Moments transcript', () => {
  it('is the reel’s own captions, one block per moment in play order, with its speaker', () => {
    const blocks = momentBlocks(REEL);
    expect(blocks.map(block => block.slot)).toEqual([2, 1]);
    expect(blocks[1].lines).toEqual([
      { key: 'm1:0', startMs: 250, text: 'For white Americans,' },
      { key: 'm1:1', startMs: 3_000, text: 'it’s sort of invisible.' },
    ]);
  });

  it('reads each cue as clean text, dropping empty ones, so joined cues read as prose', () => {
    const blocks = momentBlocks([
      moment(0, 0, 1, [
        [0, '  more insecure with  '],
        [1_000, ' '],
        [2_000, 'themselves\nand they have'],
      ]),
    ]);
    expect(blocks[0].lines.map(line => line.text)).toEqual(['more insecure with', 'themselves and they have']);
    const full = fullDebateBlocks(transcript({ segments: [segment(0, 1, ' One  two '), segment(1_000, 1, '   ')] }));
    expect(full[0].lines.map(line => line.text)).toEqual(['One two']);
  });

  it('leaves a moment without a known speaker unattributed', () => {
    expect(momentBlocks([moment(0, 0, null, [[0, 'Hi.']])])[0].slot).toBeNull();
  });
});

describe('the Full debate transcript', () => {
  it('reads the sentences when served, in time order, grouped into turns', () => {
    const blocks = fullDebateBlocks(
      transcript({
        segments: [segment(0, 1, 'ignored fragment')],
        sentences: [
          { participant_slot: 2, start_ms: 9_000, end_ms: 10_000, text: 'Not so.' },
          { participant_slot: 1, start_ms: 1_000, end_ms: 2_000, text: 'First.' },
          { participant_slot: 1, start_ms: 3_000, end_ms: 4_000, text: 'Second.' },
        ],
      })
    );
    expect(blocks.map(block => [block.slot, block.debateStartMs, block.lines.map(line => line.text)])).toEqual([
      [1, 1_000, ['First.', 'Second.']],
      [2, 9_000, ['Not so.']],
    ]);
  });

  // An old transcript sends `sentences: []`, not nothing: it must still show its lines.
  it('falls back to the lines when the sentences are empty', () => {
    const blocks = fullDebateBlocks(transcript({ segments: [segment(5_000, 2, 'from voting.')], sentences: [] }));
    expect(blocks.flatMap(block => block.lines.map(line => line.text))).toEqual(['from voting.']);
  });

  it('is empty for no transcript', () => {
    expect(fullDebateBlocks(undefined)).toEqual([]);
  });

  // The rendered video's clock, which the player's full debate plays: never the recordings'.
  it('keeps the rendered times, not the recordings’', () => {
    const blocks = fullDebateBlocks(
      transcript({
        segments: [{ ...segment(24_551, 1, 'If you have'), source_start_ms: 25_810, source_end_ms: 26_810 }],
      })
    );
    expect(blocks[0].lines[0].startMs).toBe(24_551);
  });
});

describe('the line being spoken', () => {
  const lines = [
    { key: 'a', startMs: 1_000, text: 'a' },
    { key: 'b', startMs: 3_000, text: 'b' },
  ];

  it('is the last line started, held through the gap after it', () => {
    expect(lineAt(lines, 999)).toBeNull();
    expect(lineAt(lines, 1_000)?.key).toBe('a');
    expect(lineAt(lines, 2_999)?.key).toBe('a');
    expect(lineAt(lines, 60_000)?.key).toBe('b');
  });

  it('follows the reel into each clip, and places the moment in the full debate', () => {
    const reel = momentBlocks(REEL);
    const full = fullDebateBlocks(
      transcript({
        segments: [segment(140_000, 1, 'earlier'), segment(143_100, 1, 'invisible'), segment(189_000, 2, 'later')],
      })
    );
    expect(highlightedLines({ mode: 'moments', index: 0, clipMs: 2_500, fullMs: 0 }, REEL, reel, full)).toEqual({
      moments: 'm0:1',
      full: 'f2',
    });
    // Moment 1's clip starts at 140 s in the debate: 3.2 s in is 143.2 s.
    expect(highlightedLines({ mode: 'moments', index: 1, clipMs: 3_200, fullMs: 0 }, REEL, reel, full)).toEqual({
      moments: 'm1:1',
      full: 'f1',
    });
  });

  it('is only in the full debate while the full debate plays', () => {
    const full = fullDebateBlocks(transcript({ segments: [segment(0, 1, 'one'), segment(5_000, 2, 'two')] }));
    expect(
      highlightedLines({ mode: 'full', index: 1, clipMs: 0, fullMs: 6_000 }, REEL, momentBlocks(REEL), full)
    ).toEqual({ moments: null, full: 'f1' });
    expect(highlightedLines(null, REEL, momentBlocks(REEL), full)).toEqual({ moments: null, full: null });
  });
});

describe('who said a block', () => {
  const speakers = {
    top: { name: 'Maya Chen', side: 'Agree', byline: null, avatarUrl: null, avatarSeed: 'space-1' },
    bottom: null,
  };

  it('is the debater the debate names, else the reel’s name for the slot, else the slot', () => {
    expect(blockSpeaker(1, speakers, {})).toMatchObject({ name: 'Maya Chen', side: 'Agree' });
    expect(blockSpeaker(2, speakers, { 2: 'Tom Okafor' })).toMatchObject({ name: 'Tom Okafor', side: null });
    expect(blockSpeaker(2, null, {})).toMatchObject({ name: 'Debater 2', side: null });
    expect(blockSpeaker(null, speakers, {})).toBeNull();
  });

  it('reads each slot’s name from the reel’s turns', () => {
    expect(
      decodeSlotNames({
        turns: [
          { participant_slot: 1, speaker_name: ' Susan Winter ' },
          { participant_slot: 2, speaker_name: '' },
          { participant_slot: 1, speaker_name: 'Someone else' },
          { participant_slot: 2, speaker_name: 'Kevin (kevin.9)' },
          { participant_slot: 3, speaker_name: 'Nobody' },
          null,
        ],
      })
    ).toEqual({ 1: 'Susan Winter', 2: 'Kevin' });
    expect(decodeSlotNames(undefined)).toEqual({});
  });
});

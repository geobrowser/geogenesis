import { describe, expect, it } from 'vitest';

import type { DebateMediaTurnSegment } from '../api';
import type { DebateMoment } from './debate-moments';
import { momentExpandSeconds } from './moment-expand-time';

/**
 * An edited Open rounds render: turn 1 plays 0–60 s on both clocks; the render then condenses a
 * 40 s break into 10 s, so turn 2 is 70–130 s rendered but 100–160 s on the recordings. Between
 * them (60–70 s rendered) is the condensed break, outside every turn.
 */
const TURNS = [
  {
    turn_index: 0,
    participant_slot: 1,
    output_start_ms: 0,
    output_end_ms: 60_000,
    duration_ms: 60_000,
    source_start_ms: 0,
    source_end_ms: 60_000,
  },
  {
    turn_index: 1,
    participant_slot: 2,
    output_start_ms: 70_000,
    output_end_ms: 130_000,
    duration_ms: 60_000,
    source_start_ms: 100_000,
    source_end_ms: 160_000,
  },
] as unknown as DebateMediaTurnSegment[];

function moment(overrides: Partial<DebateMoment> = {}): DebateMoment {
  return {
    id: 'clip-1',
    momentIndex: 0,
    claimIndex: 0,
    claimText: null,
    participantSlot: 2,
    clipUrl: 'https://chat.example/debates/d/moments/clip-1/content',
    durationMs: 12_000,
    debateStartMs: 72_000,
    debateEndMs: 82_000,
    // The clip's 3 s of lead-in starts inside the condensed break.
    cutStartMs: 69_000,
    cutEndMs: 82_250,
    captions: [],
    ...overrides,
  };
}

describe('momentExpandSeconds', () => {
  it('maps a point in the moment onto the recordings’ clock', () => {
    // 5 s into the clip = 74 s rendered = 104 s on the recordings.
    expect(momentExpandSeconds(moment(), 5_000, TURNS)).toBe(104);
  });

  it('never opens earlier than the moment’s words when the lead-in sits in a condensed break', () => {
    // 0.5 s into the clip is 69.5 s rendered, in the break, which `recordingTimeOf` cannot map and
    // would leave at 69 s — half a minute early, back in turn 1. Floored at the words (72 s) → 102 s.
    expect(momentExpandSeconds(moment(), 500, TURNS)).toBe(102);
  });

  it('passes a render with no source times through unchanged', () => {
    expect(momentExpandSeconds(moment({ cutStartMs: 10_000, debateStartMs: 10_250 }), 2_000, [])).toBe(12);
  });

  it('has no time for a moment with no place in the debate', () => {
    expect(momentExpandSeconds(moment({ cutStartMs: null, debateStartMs: null }), 2_000, TURNS)).toBeNull();
  });
});

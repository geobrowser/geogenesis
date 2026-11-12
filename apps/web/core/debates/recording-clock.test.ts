import { describe, expect, it } from 'vitest';

import type { DebateMediaTurnSegment, DebateTranscriptSegment } from './api';
import { RENDERED_SOURCE_TURNS, RENDERED_TURN_SEGMENTS } from './open-rounds-media-fixtures';
import {
  recordingSpanOf,
  recordingTimeOf,
  renderedTimeOf,
  transcriptOnRecordings,
  turnOnRecordings,
} from './recording-clock';

const line = (start: number, end: number, source?: [number, number]) =>
  ({
    id: `${start}`,
    participant_slot: 1,
    position: true,
    position_label: 'Agree',
    sequence_index: 0,
    start_ms: start,
    end_ms: end,
    ...(source && { source_start_ms: source[0], source_end_ms: source[1] }),
    text: 'x',
    metadata: {},
    created_at: '',
  }) as DebateTranscriptSegment;

describe('turnOnRecordings', () => {
  it('reads every turn of an edited Open rounds render off its served source times', () => {
    expect(
      RENDERED_TURN_SEGMENTS.map(turnOnRecordings).map(turn => [
        turn.turn_index,
        turn.output_start_ms,
        turn.output_end_ms,
      ])
    ).toEqual(RENDERED_SOURCE_TURNS);
  });

  it('moves the countdown with its turn', () => {
    // Round 2's opening: rendered at 121.6 s, recorded at 128 s.
    expect(turnOnRecordings(RENDERED_TURN_SEGMENTS[2]).countdown_start_ms).toBe(128_000);
  });

  it('rebases both original clock endpoints without clamping them to the shortened turn', () => {
    const turn: DebateMediaTurnSegment = {
      turn_index: 2,
      participant_slot: 1,
      output_start_ms: 100_000,
      output_end_ms: 197_000,
      duration_ms: 97_000,
      source_start_ms: 150_000,
      source_end_ms: 247_000,
      countdown_start_ms: 97_000,
      countdown_end_ms: 217_000,
      countdown_duration_ms: 120_000,
    };
    expect(turnOnRecordings(turn)).toMatchObject({
      output_start_ms: 150_000,
      output_end_ms: 247_000,
      countdown_start_ms: 147_000,
      countdown_end_ms: 267_000,
      countdown_duration_ms: 120_000,
    });
  });

  it('leaves a turn with no source times as it is: a fixed format, where the clocks agree', () => {
    const turn: DebateMediaTurnSegment = {
      turn_index: 0,
      participant_slot: 1,
      output_start_ms: 0,
      output_end_ms: 60_000,
      duration_ms: 60_000,
    };
    expect(turnOnRecordings(turn)).toBe(turn);
  });
});

describe('transcriptOnRecordings', () => {
  it('reads each line off its source time', () => {
    expect(
      transcriptOnRecordings([line(130_000, 131_000, [136_400, 137_400])]).map(l => [l.start_ms, l.end_ms])
    ).toEqual([[136_400, 137_400]]);
  });

  // A line with no source time in an edited render fell in a stretch the render cut.
  it('drops a line the edited render cut, keeping the rest', () => {
    const lines = transcriptOnRecordings([line(0, 1_000, [0, 1_000]), line(211_600, 211_600)]);
    expect(lines.map(l => l.start_ms)).toEqual([0]);
  });

  it('keeps a fixed format’s lines as they are', () => {
    const lines = [line(0, 1_000), line(2_000, 3_000)];
    expect(transcriptOnRecordings(lines)).toEqual(lines);
  });
});

describe('recordingTimeOf', () => {
  it('carries a time over by its offset into the turn', () => {
    expect(recordingTimeOf(130_000, RENDERED_TURN_SEGMENTS, 'start')).toBe(136_400);
  });

  // Where an early end's quiet was cut, turns 4 and 5 meet at 254.994 s on the rendered clock but
  // sit 3.7 s apart on the recordings.
  it('gives a time on the line between two turns to the turn it opens or closes', () => {
    expect(recordingTimeOf(254_994, RENDERED_TURN_SEGMENTS, 'end')).toBe(270_944);
    expect(recordingTimeOf(254_994, RENDERED_TURN_SEGMENTS, 'start')).toBe(274_650);
  });

  // Copilot, #2843: the media's order is not promised, and the boundary must not depend on it.
  it('picks the same side of a boundary whatever order the turns arrive in', () => {
    const reversed = [...RENDERED_TURN_SEGMENTS].reverse();
    expect(recordingTimeOf(254_994, reversed, 'end')).toBe(270_944);
    expect(recordingTimeOf(254_994, reversed, 'start')).toBe(274_650);
  });

  it('leaves a time outside every turn, or a render with no source times, where it is', () => {
    expect(recordingTimeOf(400_000, RENDERED_TURN_SEGMENTS, 'start')).toBe(400_000);
    expect(
      recordingTimeOf(
        130_000,
        RENDERED_TURN_SEGMENTS.map(({ source_start_ms: _s, source_end_ms: _e, ...rest }) => rest),
        'start'
      )
    ).toBe(130_000);
  });
});

const FIXED_FORMAT_TURNS = RENDERED_TURN_SEGMENTS.map(({ source_start_ms: _s, source_end_ms: _e, ...rest }) => rest);

describe('recordingSpanOf (GEO-3671)', () => {
  it('moves both edges of a span by the turn holding its middle', () => {
    // Turn 2 is rendered from 121.6 s and recorded from 128 s: a 6.4 s shift.
    expect(recordingSpanOf(130_000, 140_000, RENDERED_TURN_SEGMENTS)).toEqual({ start_ms: 136_400, end_ms: 146_400 });
  });

  // A cut's clear room reaches 0.4 s before turn 2 into the condensed break. Mapped edge by edge the
  // start would land in turn 1 on the recordings, 8 s from the rest of the clip.
  it('keeps a cut that reaches past its turn’s rendered edge the length it is', () => {
    expect(recordingSpanOf(121_200, 131_200, RENDERED_TURN_SEGMENTS)).toEqual({ start_ms: 127_600, end_ms: 137_600 });
  });

  it('leaves a span where it is when the clocks agree', () => {
    expect(recordingSpanOf(130_000, 140_000, FIXED_FORMAT_TURNS)).toEqual({ start_ms: 130_000, end_ms: 140_000 });
  });
});

describe('renderedTimeOf (GEO-3671)', () => {
  it('is the inverse of recordingTimeOf inside a turn', () => {
    expect(renderedTimeOf(136_400, RENDERED_TURN_SEGMENTS, 'start')).toBe(130_000);
    expect(
      recordingTimeOf(renderedTimeOf(146_400, RENDERED_TURN_SEGMENTS, 'end')!, RENDERED_TURN_SEGMENTS, 'end')
    ).toBe(146_400);
  });

  // 120 s to 128 s on the recordings is the break the render condensed: no clip edge can sit in it.
  it('has no rendered time for a stretch the render cut or condensed', () => {
    expect(renderedTimeOf(124_000, RENDERED_TURN_SEGMENTS, 'start')).toBeNull();
    expect(renderedTimeOf(124_000, RENDERED_TURN_SEGMENTS, 'end')).toBeNull();
  });

  it('is the same time on a render with one clock', () => {
    expect(renderedTimeOf(124_000, FIXED_FORMAT_TURNS, 'start')).toBe(124_000);
  });
});

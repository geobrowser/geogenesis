import { describe, expect, it } from 'vitest';

import type { DebateMediaTurnSegment, DebateTranscriptSegment } from './api';
import { RENDERED_SOURCE_TURNS, RENDERED_TURN_SEGMENTS } from './open-rounds-media-fixtures';
import { recordingTimeOf, transcriptOnRecordings, turnOnRecordings } from './recording-clock';

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

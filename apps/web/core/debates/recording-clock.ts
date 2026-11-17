import type { DebateMediaTurnSegment, DebateTranscriptSegment } from './api';

/** Anything placed on both clocks as a transcript line is: a line, or one of its words (GEO-3349). */
type TimedOnBothClocks = Pick<DebateTranscriptSegment, 'start_ms' | 'end_ms' | 'source_start_ms' | 'source_end_ms'>;

/**
 * The web player's clock: the raw recordings', from the debate's start (GEO-3293).
 *
 * geo-chat serves every placed time on two clocks: the rendered video's (`output_*`, and the bare
 * `start_ms` / `end_ms` on transcript lines) and the raw recordings' (`source_*`). An Open rounds
 * render edits its video, cutting each pick window, condensing each break and cutting an early
 * end's quiet, so after the first edit the two clocks drift apart. This player plays the two raw
 * recordings, so it reads the source times, and never rebuilds the render's edits itself.
 *
 * A fixed format, or a render with no edits, serves no source times because its two clocks are
 * the same, so the rendered time stands in. Contract: geo-chat `docs/open-rounds-contract.md` §10c.
 */

/** A turn segment with its times on the recordings' clock, in the same fields. */
export function turnOnRecordings(segment: DebateMediaTurnSegment): DebateMediaTurnSegment {
  if (segment.source_start_ms === undefined || segment.source_end_ms === undefined) return segment;
  const shift = segment.source_start_ms - segment.output_start_ms;
  return {
    ...segment,
    output_start_ms: segment.source_start_ms,
    output_end_ms: segment.source_end_ms,
    // Clock endpoints move by the same offset even when they sit outside the retained turn.
    ...(segment.countdown_start_ms !== undefined && { countdown_start_ms: segment.countdown_start_ms + shift }),
    ...(segment.countdown_end_ms !== undefined && { countdown_end_ms: segment.countdown_end_ms + shift }),
  };
}

/**
 * Transcript lines on the recordings' clock. Once any line carries a source time the render was
 * edited, and a line without one fell in a stretch the render cut: it was never in the video, and
 * on the recordings it is talk between rounds, which the player keeps silent and uncaptioned.
 */
export function transcriptOnRecordings<T extends TimedOnBothClocks>(lines: readonly T[]): T[] {
  if (!lines.some(line => line.source_start_ms !== undefined)) return [...lines];
  return lines.flatMap(line =>
    line.source_start_ms !== undefined && line.source_end_ms !== undefined
      ? [{ ...line, start_ms: line.source_start_ms, end_ms: line.source_end_ms }]
      : []
  );
}

/**
 * A rendered time on the recordings' clock, by the turn it falls in: each turn is one stretch the
 * render kept whole, so the offset into it carries straight over. For claim timecodes published
 * to the graph, the one time that comes without its source time served beside it. `turns` are as
 * served, on both clocks.
 *
 * A time on the line between two turns belongs to the turn it opens (`start`) or closes (`end`):
 * where an early end's quiet was cut, the two turns meet there on the rendered clock but not on
 * the recordings'. A time outside every turn, or a render with no source times, stays as it is.
 */
export function recordingTimeOf(
  renderedMs: number,
  turns: readonly DebateMediaTurnSegment[],
  edge: 'start' | 'end'
): number {
  // In turn order, whatever order the media listed them in: on a shared boundary the later turn is
  // the one that opens there and the earlier the one that closes.
  const holding = turns
    .filter(
      turn =>
        turn.source_start_ms !== undefined && renderedMs >= turn.output_start_ms && renderedMs <= turn.output_end_ms
    )
    .sort((a, b) => a.turn_index - b.turn_index);
  const turn = edge === 'start' ? holding.at(-1) : holding[0];
  return turn?.source_start_ms === undefined ? renderedMs : turn.source_start_ms + (renderedMs - turn.output_start_ms);
}

/**
 * A span of the rendered video on the recordings' clock, both edges moved by the turn holding its
 * middle (GEO-3671): a moment's cut, whose clear room either side of its words can reach past its
 * turn's rendered edge into the next stretch. Mapping each edge by itself would carry such an edge
 * across a cut the render made; one shift keeps the span the length it is. A middle outside every
 * turn falls back to {@link recordingTimeOf} per edge.
 */
export function recordingSpanOf(
  renderedStartMs: number,
  renderedEndMs: number,
  turns: readonly DebateMediaTurnSegment[]
): { start_ms: number; end_ms: number } {
  const middle = (renderedStartMs + renderedEndMs) / 2;
  const turn = turns.find(
    candidate =>
      candidate.source_start_ms !== undefined &&
      middle >= candidate.output_start_ms &&
      middle <= candidate.output_end_ms
  );
  if (turn?.source_start_ms === undefined) {
    return {
      start_ms: recordingTimeOf(renderedStartMs, turns, 'start'),
      end_ms: recordingTimeOf(renderedEndMs, turns, 'end'),
    };
  }
  const shift = turn.source_start_ms - turn.output_start_ms;
  return { start_ms: renderedStartMs + shift, end_ms: renderedEndMs + shift };
}

/**
 * A time on the recordings' clock on the rendered video's, or `null` where the render has none: a
 * stretch it cut or condensed (a pick window, a break, an early end's quiet), which a hand-picked
 * clip's edge cannot sit in, since geo-chat refuses a clip that crosses a cut (GEO-3671).
 *
 * The inverse of {@link recordingTimeOf}: each turn is one stretch the render kept whole, at real
 * speed, so the offset into it carries straight over. A render with no source times has one clock.
 */
export function renderedTimeOf(
  recordingMs: number,
  turns: readonly DebateMediaTurnSegment[],
  edge: 'start' | 'end'
): number | null {
  if (!turns.some(turn => turn.source_start_ms !== undefined)) return recordingMs;
  const holding = turns
    .filter(
      turn =>
        turn.source_start_ms !== undefined &&
        turn.source_end_ms !== undefined &&
        recordingMs >= turn.source_start_ms &&
        recordingMs <= turn.source_end_ms
    )
    .sort((a, b) => a.turn_index - b.turn_index);
  const turn = edge === 'start' ? holding.at(-1) : holding[0];
  return turn?.source_start_ms === undefined ? null : turn.output_start_ms + (recordingMs - turn.source_start_ms);
}

import type { DebateMediaTurnSegment, DebateTranscriptSegment } from './api';

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
    // Only served on the rendered clock. It sits inside its turn, so it moves with it.
    ...(segment.countdown_start_ms !== undefined && { countdown_start_ms: segment.countdown_start_ms + shift }),
  };
}

/**
 * Transcript lines on the recordings' clock. Once any line carries a source time the render was
 * edited, and a line without one fell in a stretch the render cut: it was never in the video, and
 * on the recordings it is talk between rounds, which the player keeps silent and uncaptioned.
 */
export function transcriptOnRecordings<T extends DebateTranscriptSegment>(lines: readonly T[]): T[] {
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
  const holding = turns.filter(
    turn => turn.source_start_ms !== undefined && renderedMs >= turn.output_start_ms && renderedMs <= turn.output_end_ms
  );
  const turn = edge === 'start' ? holding.at(-1) : holding[0];
  return turn?.source_start_ms === undefined ? renderedMs : turn.source_start_ms + (renderedMs - turn.output_start_ms);
}

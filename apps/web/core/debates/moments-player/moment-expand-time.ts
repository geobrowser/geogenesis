import type { DebateMediaTurnSegment } from '../api';
import { recordingTimeOf } from '../recording-clock';
import { type DebateMoment, debateTimeForMoment } from './debate-moments';

/**
 * Where the full screen should open for a viewer `clipMs` into a moment of the Explore card's reel
 * (GEO-3833): whole seconds on the recordings' clock, which is the clock the full-screen player and
 * its `?t=` read. Null when the moment has no place in the debate.
 *
 * A moment's clip is cut with some room before its words (`cutStartMs`), and in an edited Open
 * rounds render that room can fall in a stretch the render condensed or cut, outside every turn,
 * where `recordingTimeOf` cannot map it and would hand back the rendered time unchanged — early by
 * whatever was cut before it. So the time is never earlier than where the moment's words start.
 */
export function momentExpandSeconds(
  moment: DebateMoment,
  clipMs: number,
  turns: readonly DebateMediaTurnSegment[] | null | undefined
): number | null {
  const rendered = debateTimeForMoment(moment, clipMs);
  if (rendered === null) return null;
  const floored = moment.debateStartMs === null ? rendered : Math.max(rendered, moment.debateStartMs);
  return Math.max(0, Math.floor(recordingTimeOf(floored, turns ?? [], 'start') / 1000));
}

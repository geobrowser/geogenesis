import type { DebateMediaTurnSegment } from '~/core/debates/api';
import type { DebateMoment } from '~/core/debates/moments-player/debate-moments';
import type { PlaybackTimeline } from '~/core/debates/playback-timeline';
import { recordingTimeOf } from '~/core/debates/recording-clock';

import type { ScrubberMoment } from './feed-scrubber';

/**
 * The reel's moments as dots on the dark full screen's rail (GEO-3833), on the clock the full-screen
 * player plays: the raw recordings' (`recording-clock.ts`).
 *
 * Placed where each moment's words start (`debateStartMs`), not where its clip file starts
 * (`cutStartMs`). The clip is cut with some room before the words, and in an edited Open rounds
 * render that room can fall in a stretch the render condensed or cut, outside every turn, where
 * `recordingTimeOf` cannot map it and hands back the rendered time unchanged: early by whatever was
 * cut before it, so the dot would seek into the wrong turn. The words always sit inside a turn.
 *
 * `turns` are the media's turn segments as served, on both clocks. A moment with no range has no
 * place on the rail and is left out. In time order, since a reel's play order can step back.
 */
export function momentDotsOnRecordings(
  moments: readonly DebateMoment[],
  turns: readonly DebateMediaTurnSegment[] | null | undefined
): ScrubberMoment[] {
  const dots: ScrubberMoment[] = [];
  for (const moment of moments) {
    if (moment.debateStartMs === null) continue;
    const atMs = Math.max(0, recordingTimeOf(moment.debateStartMs, turns ?? [], 'start'));
    dots.push({ id: moment.id, atMs });
  }
  return dots.sort((a, b) => a.atMs - b.atMs);
}

/**
 * How close to the end a forward skip may land. Seeking to the very last frame ends the debate on
 * the spot, which turns a "forward 10 seconds" near the end into the end card; the app's timeline
 * stops the same 0.15 s short (`PlaybackTimeline`'s `maximum`).
 */
export const SKIP_END_MARGIN_MS = 150;

/**
 * Where ↺10 / ↻10 land, in seconds on the recordings' clock (GEO-3833, the app's `VideoTransport`).
 *
 * Ten seconds of what the viewer watches, not of the recordings: an Open rounds debate's breaks are
 * cut short in playback (`playback-timeline.ts`), so the skip is measured on the playback timeline
 * and mapped back. Never before the start, and never onto the last frame.
 */
export function skipTargetSeconds(timeline: PlaybackTimeline, currentSeconds: number, deltaSeconds: number): number {
  const playbackMs = timeline.toPlaybackMs(currentSeconds * 1000) + deltaSeconds * 1000;
  const lastMs = Math.max(0, timeline.durationMs - SKIP_END_MARGIN_MS);
  const clamped = Math.max(0, Math.min(lastMs, playbackMs));
  return timeline.toSourceMs(clamped) / 1000;
}

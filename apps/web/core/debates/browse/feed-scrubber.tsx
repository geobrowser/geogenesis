'use client';

import * as React from 'react';

import cx from 'classnames';

import type { ClaimMarker } from '~/core/debates/claim-ticker';
import type { PlaybackTimeline } from '~/core/debates/playback-timeline';

import { ClaimScrubberMarkers } from './debate-claim-ticker';

/** A moment of the debate's reel, placed on the recordings' clock (`debate-full-moments.ts`). */
export type ScrubberMoment = { id: string; atMs: number };

// Only the keys that actually move a range thumb should pause playback. Firing on every
// key means Tab/Shift while the slider is focused would start a scrub whose keyup lands on
// another element, leaving playback stuck paused.
const isScrubKey = (key: string) =>
  key.startsWith('Arrow') || key === 'Home' || key === 'End' || key === 'PageUp' || key === 'PageDown';

/**
 * The debate's timeline: a track, the playhead's fill and thumb, the claim markers, and a range input
 * over all of it.
 *
 * `overlay` is the player's own bar, drawn over the bottom tile of a card. `header` is the dark full
 * screen's rail (GEO-3833), the debates app's `FullControls`: a 4px track in the header row, with the
 * reel's moments as dots on it that seek to where each moment starts.
 */
export function FeedScrubber({
  currentTime,
  timeline,
  markers,
  moments = [],
  variant = 'overlay',
  onSeek,
  onMomentSeek,
  onScrubStart,
  onScrubEnd,
}: {
  currentTime: number;
  timeline: PlaybackTimeline;
  markers: ClaimMarker[];
  /** The reel's moments, drawn as dots on a `header` rail. */
  moments?: readonly ScrubberMoment[];
  variant?: 'overlay' | 'header';
  onSeek: (seconds: number) => void;
  /** A moment dot was pressed. Falls back to `onSeek`. */
  onMomentSeek?: (seconds: number) => void;
  onScrubStart: () => void;
  onScrubEnd: () => void;
}) {
  const header = variant === 'header';
  const duration = timeline.durationMs / 1000;
  const bounded = timeline.toPlaybackMs(currentTime * 1000) / 1000;
  const progress = duration > 0 ? (bounded / duration) * 100 : 0;
  const displayedMarkers = React.useMemo(
    () =>
      markers.map(marker => ({
        ...marker,
        fraction: timeline.durationMs > 0 ? timeline.toPlaybackMs(marker.atMs) / timeline.durationMs : 0,
      })),
    [markers, timeline]
  );
  const displayedMoments = React.useMemo(
    () =>
      timeline.durationMs > 0
        ? moments.map(moment => ({
            ...moment,
            fraction: Math.max(0, Math.min(1, timeline.toPlaybackMs(moment.atMs) / timeline.durationMs)),
          }))
        : [],
    [moments, timeline]
  );
  return (
    <div
      className={cx(
        'relative flex items-center px-3',
        header ? 'h-11 [--track-height:4px]' : 'h-5 [--track-height:5px]'
      )}
    >
      <div
        className={cx(
          'relative h-(--track-height) w-full overflow-hidden rounded-full',
          header ? 'bg-white/19' : 'bg-white/40'
        )}
      >
        <span className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: `${progress}%` }} />
      </div>
      {/* Above the range input, which is the only way a marker can be clicked at all: the input is
          transparent but covers the whole bar, so at a lower z it swallowed every marker click and
          scrubbed to the pixel instead of seeking to the claim. The comment here used to claim the
          opposite, which is how it survived.

          The markers' wrapper is `pointer-events-none`, so only the targets themselves intercept
          and a drag starting anywhere else along the bar still reaches the input. Those targets are
          no longer the 2px hashes, though: they are up to 12px wide, clamped to the gap to the next
          claim — a mean 10% of the track, 44% on the densest debate in the corpus. See
          {@link MARKER_HIT_WIDTH_PX} for why that ceiling and not 24. */}
      {/* Only placement uses the edited clock; claim clicks retain their precise source timestamps. */}
      <ClaimScrubberMarkers markers={displayedMarkers} onSeek={ms => onSeek(ms / 1000)} className="z-3" />
      {displayedMoments.length > 0 && (
        // The app's 6px white dots on the track (`PlaybackTimeline`'s markers), one per moment of the
        // reel. Targets like the claim markers: above the input, the wrapper letting drags through.
        <div data-moment-dots className="pointer-events-none absolute inset-x-3 top-1/2 z-3 -translate-y-1/2">
          {displayedMoments.map((moment, index) => (
            <button
              key={moment.id}
              type="button"
              aria-label={`Moment ${index + 1} of ${displayedMoments.length}`}
              data-moment-dot={moment.atMs}
              onClick={event => {
                event.stopPropagation();
                (onMomentSeek ?? onSeek)(moment.atMs / 1000);
              }}
              style={{ left: `${moment.fraction * 100}%` }}
              className="pointer-events-auto absolute top-1/2 grid size-4 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-transparent"
            >
              <span aria-hidden className="block size-1.5 rounded-full bg-white" />
            </button>
          ))}
        </div>
      )}
      <span
        className={cx(
          'pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.35)]',
          header ? 'size-2' : 'size-3'
        )}
        style={{ left: `calc(12px + ${progress}% * (100% - 24px) / 100%)` }}
      />
      <input
        className={cx(
          'absolute inset-0 z-2 m-0 w-full cursor-pointer appearance-none bg-transparent opacity-0',
          header ? 'h-11' : 'h-5'
        )}
        type="range"
        min="0"
        max={duration > 0 ? duration : 1}
        step="0.05"
        value={bounded}
        aria-label="Debate timeline"
        onChange={event => onSeek(timeline.toSourceMs(Number(event.currentTarget.value) * 1000) / 1000)}
        // Pause playback for the duration of the drag so the play clock doesn't fight the
        // seek. onLostPointerCapture reliably fires when a range drag ends (the input
        // captures the pointer on pointerdown), even if the pointer leaves the thumb.
        onPointerDown={onScrubStart}
        onPointerUp={onScrubEnd}
        onLostPointerCapture={onScrubEnd}
        onKeyDown={e => isScrubKey(e.key) && onScrubStart()}
        onKeyUp={e => isScrubKey(e.key) && onScrubEnd()}
      />
    </div>
  );
}

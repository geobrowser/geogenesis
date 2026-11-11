'use client';

import * as React from 'react';

import cx from 'classnames';

import type { Debate } from '~/core/debates/api';
import type { DebatePagePlayerState } from '~/core/debates/debate-page-outcome';
import { useDebateMedia } from '~/core/debates/hooks';
import { hasMediaArtifact } from '~/core/debates/playback-utils';
import { debateArtifactContentUrl, fallBackToDurableStill, speakerStillContentUrl } from '~/core/debates/speaker-still';
import { markDebateWatched } from '~/core/debates/watched-debates';

import { Play } from './icons';

type CombinedDebatePlayerProps = {
  debate: Debate;
  /** Load the media list; the feed passes its active and preloading cards. */
  enabled: boolean;
  /** As for `DebateFeedPlayer`: playback pauses when the card stops being the active one. */
  active?: boolean;
  /** Detach the video from its element, as for `DebateFeedPlayer`. */
  releaseMedia?: boolean;
  onPlaybackRequest?: () => void;
  onPlaybackState?: (state: DebatePagePlayerState) => void;
  /** The host draws the frame, as for `DebateFeedPlayer`. */
  framed?: boolean;
  reducedOverlays?: boolean;
  stills?: { slot1: string | null; slot2: string | null };
};

/**
 * Feed player where video cannot play inline (see `inline-playback.ts`). `play()` must run inside
 * the tap, so `src` is the durable artifact route, set up front. HEVC first: iOS plays it natively.
 */
export function CombinedDebatePlayer({
  debate,
  enabled,
  active = true,
  releaseMedia = false,
  onPlaybackRequest,
  onPlaybackState,
  framed = false,
  reducedOverlays = false,
  stills,
}: CombinedDebatePlayerProps) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const media = useDebateMedia(debate.id, enabled);
  const kind = hasMediaArtifact(media.data, 'final_video_hevc') ? 'final_video_hevc' : 'final_video';
  const src = media.data && !releaseMedia ? debateArtifactContentUrl(debate.id, kind) : undefined;
  const error = failed || media.isError;

  React.useEffect(() => {
    onPlaybackState?.({ ready: src !== undefined, playing, autoplayBlocked: false, error });
  }, [onPlaybackState, src, playing, error]);

  React.useEffect(() => {
    if (!active) videoRef.current?.pause();
  }, [active]);

  const toggle = () => {
    const video = videoRef.current;
    if (!video || !src) return;
    if (!video.paused) {
      video.pause();
      return;
    }
    if (!active) onPlaybackRequest?.();
    setFailed(false);
    // A failed element does not reselect its source on `play()`.
    if (video.error) video.load();
    video.play().catch(() => setFailed(true));
  };

  const posters = [stills?.slot1 ?? null, stills?.slot2 ?? null];

  return (
    <div
      data-debate-combined-player=""
      className={cx(
        'relative flex flex-col overflow-hidden bg-black',
        framed ? null : reducedOverlays ? 'rounded-lg' : 'rounded-xl'
      )}
    >
      <video
        ref={videoRef}
        src={src}
        playsInline
        preload="none"
        onPlaying={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => markDebateWatched(debate.id)}
        onError={() => setFailed(true)}
        className={cx('absolute inset-0 size-full object-contain', !playing && 'invisible')}
      />
      {([1, 2] as const).map(slot => (
        <div
          key={slot}
          className={cx('relative aspect-480/289 w-full overflow-hidden bg-grey-01', playing && 'invisible')}
        >
          <img
            src={posters[slot - 1] ?? speakerStillContentUrl(debate.id, slot)}
            onError={fallBackToDurableStill(speakerStillContentUrl(debate.id, slot))}
            alt=""
            aria-hidden
            draggable={false}
            decoding="async"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          />
        </div>
      ))}
      <button
        type="button"
        aria-label={playing ? 'Pause debate' : 'Play combined debate video'}
        onClick={toggle}
        disabled={!src}
        className="absolute inset-0 z-10 grid place-items-center"
      >
        {!playing && (
          <span className="grid size-16 place-items-center rounded-full bg-white text-text shadow-card">
            <Play />
          </span>
        )}
      </button>
      {error && (
        <p className="absolute inset-x-3 bottom-3 z-20 rounded bg-black/70 px-3 py-2 text-center text-sm text-white">
          Could not play this debate. Tap to try again.
        </p>
      )}
    </div>
  );
}

'use client';

import * as React from 'react';

import cx from 'classnames';

import type { Debate } from '~/core/debates/api';
import { useDebateMedia } from '~/core/debates/hooks';
import { hasMediaArtifact } from '~/core/debates/playback-utils';
import { debateArtifactContentUrl, fallBackToDurableStill, speakerStillContentUrl } from '~/core/debates/speaker-still';

import { Play } from './icons';

type CombinedDebatePlayerProps = {
  debate: Debate;
  /** The host draws the frame, as for `DebateFeedPlayer`. */
  framed?: boolean;
  reducedOverlays?: boolean;
  stills?: { slot1: string | null; slot2: string | null };
};

/**
 * The feed player for a page that cannot play video inline (see `inline-playback.ts`).
 *
 * Laid out as the two-tile player, with each debater's still and one Play control. The tap plays
 * the combined debate video, which iOS opens full screen with both debaters in it. `play()` runs
 * inside the tap, against the durable artifact route (it redirects to a fresh signed URL), because
 * these webviews refuse a start that is not part of a gesture.
 *
 * The HEVC copy is preferred: iOS plays it natively and it is about a third the size of the WebM.
 */
export function CombinedDebatePlayer({ debate, framed = false, reducedOverlays = false, stills }: CombinedDebatePlayerProps) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [started, setStarted] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const media = useDebateMedia(debate.id, true);
  const kind = hasMediaArtifact(media.data, 'final_video_hevc') ? 'final_video_hevc' : 'final_video';
  const src = media.data ? debateArtifactContentUrl(debate.id, kind) : undefined;

  const play = () => {
    const video = videoRef.current;
    if (!video || !src) return;
    setFailed(false);
    video.play().then(
      () => setStarted(true),
      () => setFailed(true)
    );
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
        onEnded={() => setStarted(false)}
        onError={() => setFailed(true)}
        className={cx('absolute inset-0 size-full object-contain', !started && 'invisible')}
      />
      {([1, 2] as const).map(slot => (
        <div
          key={slot}
          className={cx('relative aspect-480/289 w-full overflow-hidden bg-grey-01', started && 'invisible')}
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
        aria-label="Play combined debate video"
        onClick={play}
        disabled={!src}
        className="absolute inset-0 z-10 grid place-items-center"
      >
        <span className="grid size-16 place-items-center rounded-full bg-white text-text shadow-card">
          <Play />
        </span>
      </button>
      {failed && (
        <p className="absolute inset-x-3 bottom-3 z-20 rounded bg-black/70 px-3 py-2 text-center text-sm text-white">
          Could not play this debate. Tap to try again.
        </p>
      )}
    </div>
  );
}

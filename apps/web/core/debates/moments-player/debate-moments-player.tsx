'use client';

import * as React from 'react';

import cx from 'classnames';

import { reattachVideoSource, releaseVideo } from '~/core/utils/video/release-video';

import { CloseSmall } from '~/design-system/icons/close-small';
import { ExpandSmall } from '~/design-system/icons/expand-small';

import { Play } from '../browse/icons';
import { PLAYBACK_FONT_FAMILY, PLAYBACK_OUTLINE_STYLE } from '../browse/playback-typography';
import { getGeoChatApiBaseUrl } from '../geo-chat-public-base-url';
import {
  type DebateMoment,
  debateTimeForMoment,
  formatPlaybackTime,
  fullDebateVideoUrl,
  momentCaptionAt,
  momentMarkers,
} from './debate-moments';
import { DEFAULT_PLAYBACK_GROUP, useExclusivePlayback } from './exclusive-playback';
import { type PlayerMode, initialStoryState, storyReducer } from './story-state';
import { type DebateMomentsState, useDebateMoments } from './use-debate-moments';

/**
 * A compact player for one debate (GEO-3687): its moments as a story card, and its full debate a
 * tap away. Built for the ranking compare view (GEO-3678), where two sit side by side.
 *
 * - **Moments** (the default when the debate has a reel): one bar per moment along the top, filling
 *   as the moment plays; tap or click the left or right edge to step back or on; captions from the
 *   clip's own cues; the corner control expands to the full debate at the moment on screen.
 * - **Full debate**: the rendered video with a timeline (elapsed, a bar with a dot per moment,
 *   total). A dot jumps to its moment; the close control returns to the moments, on the same one.
 * - **No moments** (no reel, or the read failed): opens straight in the full debate, with nothing
 *   to close back to.
 * - **One at a time**: starting this player pauses every other one in `playbackGroup`.
 *
 * One `<video>` for the life of the player carries every moment and the full debate, changing only
 * its `src`. iOS WebKit grants sound per element, from a tap on that element, and the grant survives
 * a `src` change (see `gesture-media-pool.ts`): a fresh element per moment would stop the reel on a
 * Play button after the first one. The next clip preloads in a second, hidden element.
 *
 * Fluid: it fills its container's width at a fixed 4:5 and sizes its type to that width, so it
 * holds up at half a phone's width.
 */
export type DebateMomentsPlayerProps = {
  /** geo-chat's debate id, which is also the Debate entity's id. Dashed or dashless. */
  debateId: string;
  /** Names the player for assistive tech, e.g. the debate's title. */
  label: string;
  className?: string;
  /**
   * The debate's moments when the host already has them. Skips the read; an empty list opens the
   * full debate. Leave out to read them with `useDebateMoments`.
   */
  moments?: DebateMoment[];
  /** Players that pause each other. Defaults to one page-wide group. */
  playbackGroup?: string;
  /** Called on every switch between the moments and the full debate, and once with the opening mode. */
  onModeChange?: (mode: PlayerMode) => void;
  /** Called whenever this player starts playing. */
  onPlay?: () => void;
};

export function DebateMomentsPlayer({ moments, ...props }: DebateMomentsPlayerProps) {
  if (moments) return <StoryFor {...props} moments={moments} />;
  return <ReadMomentsPlayer {...props} />;
}

/** Reads the reel, then plays it. Kept apart so a host that passes `moments` needs no query client. */
function ReadMomentsPlayer(props: Omit<DebateMomentsPlayerProps, 'moments'>) {
  const read: DebateMomentsState = useDebateMoments(props.debateId);

  if (read.status === 'loading') {
    return (
      <PlayerFrame label={props.label} className={props.className}>
        <span className="absolute inset-0 grid place-items-center text-[clamp(11px,4cqw,14px)] text-white/80">
          Loading…
        </span>
      </PlayerFrame>
    );
  }
  return <StoryFor {...props} moments={read.moments} />;
}

/** Keyed, so a different debate (or a re-cut reel) starts from a fresh state. */
function StoryFor(props: StoryProps) {
  return <MomentsStory key={`${props.debateId}:${props.moments.map(m => m.id).join(',')}`} {...props} />;
}

function PlayerFrame({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <section
      aria-label={label}
      className={cx(
        '@container relative isolate aspect-[4/5] w-full overflow-hidden rounded-lg bg-black text-white select-none',
        className
      )}
    >
      {children}
    </section>
  );
}

type StoryProps = Omit<DebateMomentsPlayerProps, 'moments'> & { moments: DebateMoment[] };

function MomentsStory({
  debateId,
  label,
  className,
  moments,
  playbackGroup = DEFAULT_PLAYBACK_GROUP,
  onModeChange,
  onPlay,
}: StoryProps) {
  const [story, dispatch] = React.useReducer(storyReducer, moments.length, initialStoryState);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [clipMs, setClipMs] = React.useState(0);
  const [clipDurationMs, setClipDurationMs] = React.useState<number | null>(null);
  const [fullMs, setFullMs] = React.useState(0);
  const [fullDurationMs, setFullDurationMs] = React.useState(0);
  const [failed, setFailed] = React.useState(false);
  /** Whether the next media to load should start playing: set by every step taken while playing. */
  const autoplayRef = React.useRef(false);
  /** The full debate's seek waiting for its metadata, in ms. */
  const pendingSeekRef = React.useRef<number | null>(null);
  /** The src whose metadata the element has loaded; null while a new one is loading. */
  const metadataSrcRef = React.useRef<string | null>(null);
  /** Set by expand and close, so the control that replaces the pressed one takes focus. */
  const moveFocusRef = React.useRef(false);
  const expandRef = React.useRef<HTMLButtonElement | null>(null);
  const collapseRef = React.useRef<HTMLButtonElement | null>(null);

  const moment = story.mode === 'moments' ? moments[story.index] : undefined;
  const next = story.mode === 'moments' ? moments[story.index + 1] : undefined;
  const fullSrc = fullDebateVideoUrl(debateId, getGeoChatApiBaseUrl());
  const src = moment ? moment.clipUrl : fullSrc;

  const claim = useExclusivePlayback(
    React.useCallback(() => {
      autoplayRef.current = false;
      videoRef.current?.pause();
    }, []),
    playbackGroup
  );

  const onModeChangeRef = React.useRef(onModeChange);
  React.useEffect(() => {
    onModeChangeRef.current = onModeChange;
  }, [onModeChange]);
  React.useEffect(() => {
    onModeChangeRef.current?.(story.mode);
    if (!moveFocusRef.current) return;
    moveFocusRef.current = false;
    (story.mode === 'full' ? collapseRef.current : expandRef.current)?.focus();
  }, [story.mode]);

  const start = React.useCallback((video: HTMLVideoElement | null) => {
    if (!video) return;
    setFailed(false);
    video.play()?.catch(() => {
      // Refused (autoplay policy) or interrupted by a step: the big play control stays up.
      setPlaying(false);
    });
  }, []);

  const applyPendingSeek = React.useCallback(() => {
    const video = videoRef.current;
    const at = pendingSeekRef.current;
    if (!video || at === null) return;
    pendingSeekRef.current = null;
    video.currentTime = at / 1000;
    setFullMs(at);
    if (autoplayRef.current) start(video);
  }, [start]);

  // New media in the element (a step, the reel's next moment, expand or close): whatever failed
  // before was the old media's; start the new one over, playing on if it was.
  React.useEffect(() => {
    metadataSrcRef.current = null;
    setFailed(false);
    setClipMs(0);
    setClipDurationMs(null);
    if (story.mode === 'moments' && autoplayRef.current) start(videoRef.current);
  }, [src, story.mode, start]);

  // Entering the full debate, or a dot or retry asking for a time: seek once the metadata is in.
  React.useEffect(() => {
    if (story.mode !== 'full') return;
    pendingSeekRef.current = story.fullStartMs ?? 0;
    if (metadataSrcRef.current === fullSrc) applyPendingSeek();
  }, [story.mode, story.seekRequest, story.fullStartMs, fullSrc, applyPendingSeek]);

  // Release what this player holds when it goes: React has nulled the ref by cleanup time.
  React.useEffect(() => {
    const video = videoRef.current;
    return () => {
      // Only once it has really left the page: StrictMode's rehearsal unmount keeps the element.
      if (video && !video.isConnected) releaseVideo(video);
    };
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (story.mode === 'moments' && story.finished) {
      autoplayRef.current = true;
      dispatch({ type: 'restart' });
      if (story.index === 0) {
        video.currentTime = 0;
        start(video);
      }
      return;
    }
    if (video.paused) {
      autoplayRef.current = true;
      start(video);
    } else {
      autoplayRef.current = false;
      video.pause();
    }
  };

  const step = (direction: -1 | 1) => {
    autoplayRef.current = playing;
    const atEdge = direction === 1 ? story.index >= story.count - 1 : story.index === 0;
    if (atEdge) {
      // The first card's left edge replays it, as in a story; the last card's right edge holds.
      if (direction === -1 && videoRef.current) {
        videoRef.current.currentTime = 0;
        setClipMs(0);
        setFailed(false);
      }
      return;
    }
    dispatch({ type: direction === 1 ? 'next' : 'previous' });
  };

  const expand = () => {
    autoplayRef.current = playing;
    moveFocusRef.current = true;
    dispatch({ type: 'expand', atMs: moment ? debateTimeForMoment(moment, clipMs) : null });
  };

  const collapse = () => {
    autoplayRef.current = playing;
    moveFocusRef.current = true;
    dispatch({ type: 'collapse' });
  };

  const seekFull = (atMs: number, index?: number) => {
    autoplayRef.current = playing;
    dispatch({ type: 'seekFull', atMs, index });
  };

  const retry = () => {
    const video = videoRef.current;
    if (!video) return;
    autoplayRef.current = true;
    metadataSrcRef.current = null;
    reattachVideoSource(video, src);
    if (story.mode === 'full') {
      // A reload starts the file over: ask for the place it failed at again.
      setFailed(false);
      dispatch({ type: 'seekFull', atMs: fullMs });
      return;
    }
    start(video);
  };

  const clipLengthMs = clipDurationMs ?? moment?.durationMs ?? null;
  const caption = moment ? momentCaptionAt(moment.captions, clipMs) : null;
  const zoneClass = 'absolute top-0 z-10 cursor-pointer focus-visible:bg-white/10 focus-visible:outline-none';
  const controlClass =
    'grid size-8 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-colors hover:bg-black/65 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white';

  return (
    <PlayerFrame label={label} className={className}>
      <video
        ref={videoRef}
        src={src}
        playsInline
        preload={story.mode === 'moments' ? 'auto' : 'metadata'}
        aria-label={
          story.mode === 'moments' ? `${label}: moment ${story.index + 1} of ${story.count}` : `${label}: full debate`
        }
        className="absolute inset-0 size-full object-contain"
        onTimeUpdate={event => {
          const ms = event.currentTarget.currentTime * 1000;
          if (story.mode === 'moments') setClipMs(ms);
          else setFullMs(ms);
        }}
        onLoadedMetadata={event => {
          const video = event.currentTarget;
          if (video.getAttribute('src') !== src) return;
          metadataSrcRef.current = src;
          const seconds = video.duration;
          const known = Number.isFinite(seconds) && seconds > 0;
          if (story.mode === 'moments') {
            if (known) setClipDurationMs(seconds * 1000);
            return;
          }
          if (known) setFullDurationMs(seconds * 1000);
          applyPendingSeek();
        }}
        onEnded={() => {
          if (story.mode !== 'moments') return;
          autoplayRef.current = story.index < story.count - 1;
          if (clipLengthMs !== null) setClipMs(clipLengthMs);
          dispatch({ type: 'clipEnded' });
        }}
        onPlay={() => {
          claim();
          setPlaying(true);
          onPlay?.();
        }}
        onPause={() => setPlaying(false)}
        onError={() => {
          setPlaying(false);
          setFailed(true);
        }}
      />
      {next && <PreloadClip key={next.clipUrl} src={next.clipUrl} />}

      {/* Tap zones. The middle plays and pauses; in the moments the edges step. */}
      {story.mode === 'moments' && (
        <>
          <button
            type="button"
            aria-label="Previous moment"
            onClick={() => step(-1)}
            className={cx(zoneClass, 'bottom-0 left-0 w-[30%]')}
          />
          <button
            type="button"
            aria-label="Next moment"
            onClick={() => step(1)}
            className={cx(zoneClass, 'right-0 bottom-0 w-[30%]')}
          />
        </>
      )}
      <button
        type="button"
        aria-label={playing ? 'Pause' : 'Play'}
        onClick={togglePlay}
        className={cx(
          zoneClass,
          story.mode === 'moments' ? 'bottom-0 left-[30%] w-[40%]' : 'inset-x-0 top-14 bottom-0'
        )}
      />

      {!playing && !failed && (
        <span
          aria-hidden="true"
          data-testid="play-indicator"
          className="pointer-events-none absolute top-1/2 left-1/2 z-20 grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-text shadow-card"
        >
          <Play color="text" size={18} />
        </span>
      )}

      {story.mode === 'moments' ? (
        <div className="absolute inset-x-0 top-0 z-20 flex items-start gap-2 bg-gradient-to-b from-black/50 to-transparent p-2 pb-4">
          <div className="flex flex-1 gap-1 pt-1" data-testid="moment-segments">
            {moments.map((m, i) => (
              <span key={m.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/35">
                <span
                  data-testid={`moment-segment-${i}`}
                  className="block h-full rounded-full bg-white"
                  style={{ width: `${segmentFill(i, story.index, clipMs, clipLengthMs) * 100}%` }}
                />
              </span>
            ))}
          </div>
          <button
            ref={expandRef}
            type="button"
            aria-label="Watch the full debate"
            onClick={expand}
            className={controlClass}
          >
            <ExpandSmall />
          </button>
        </div>
      ) : (
        // As in the prototype, the timeline takes the bars' place along the top: the bottom of the
        // full debate is where its own burned-in captions run.
        <div className="absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/60 to-transparent p-2 pb-4">
          <div className="flex items-center gap-2">
            <FullTimeline elapsedMs={fullMs} durationMs={fullDurationMs} moments={moments} onSeek={seekFull} />
            {story.count > 0 && (
              <button
                ref={collapseRef}
                type="button"
                aria-label="Back to moments"
                onClick={collapse}
                className={controlClass}
              >
                <CloseSmall />
              </button>
            )}
          </div>
          {story.count === 0 && !playing && (
            <p className="mt-1 text-[clamp(10px,3.6cqw,13px)] text-white/80">No moments for this debate yet</p>
          )}
        </div>
      )}

      {story.mode === 'moments' && caption && (
        <p
          className="pointer-events-none absolute inset-x-[6%] bottom-[7%] z-20 line-clamp-3 text-center text-[clamp(12px,5cqw,18px)] leading-tight font-semibold"
          style={{ fontFamily: PLAYBACK_FONT_FAMILY, ...PLAYBACK_OUTLINE_STYLE }}
        >
          {caption}
        </p>
      )}

      {failed && (
        <div className="absolute inset-x-3 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-2 text-center">
          <span className="text-[clamp(11px,4cqw,14px)] text-white/90">
            {story.mode === 'moments' ? 'Couldn’t play this moment.' : 'Couldn’t play this debate.'}
          </span>
          <button
            type="button"
            onClick={retry}
            className="rounded bg-white px-3 py-1.5 text-sm font-medium text-text shadow-card"
          >
            Retry
          </button>
        </div>
      )}
    </PlayerFrame>
  );
}

/**
 * The next moment's clip, fetched ahead into a hidden element so stepping on does not wait on a
 * cold redirect and fetch. Keyed by its src, so each one is released when it is no longer next.
 */
function PreloadClip({ src }: { src: string }) {
  const ref = React.useRef<HTMLVideoElement | null>(null);
  React.useEffect(() => {
    const video = ref.current;
    return () => {
      // Only once it has really left the page: StrictMode's rehearsal unmount keeps the element.
      if (video && !video.isConnected) releaseVideo(video);
    };
  }, []);
  return (
    <video ref={ref} data-preload="" aria-hidden="true" src={src} preload="auto" muted playsInline className="hidden" />
  );
}

/** How full moment `i`'s bar is: played ones full, later ones empty, the current one by progress. */
export function segmentFill(i: number, current: number, clipMs: number, clipLengthMs: number | null): number {
  if (i < current) return 1;
  if (i > current) return 0;
  if (!clipLengthMs || clipLengthMs <= 0) return 0;
  return Math.max(0, Math.min(1, clipMs / clipLengthMs));
}

const SEEK_STEP_MS = 5_000;

function FullTimeline({
  elapsedMs,
  durationMs,
  moments,
  onSeek,
}: {
  elapsedMs: number;
  durationMs: number;
  moments: DebateMoment[];
  onSeek: (atMs: number, index?: number) => void;
}) {
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const markers = momentMarkers(moments, durationMs);
  const fraction = durationMs > 0 ? Math.max(0, Math.min(1, elapsedMs / durationMs)) : 0;
  const known = durationMs > 0;

  const seekTo = (ms: number) => onSeek(Math.max(0, Math.min(durationMs, ms)));

  return (
    // The bar gets the row's whole width and the times sit under it: at half a phone's width there
    // is no room for both on one line, and the dots need the length.
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="relative h-6 w-full">
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="Debate position"
          aria-valuemin={0}
          aria-valuemax={known ? Math.round(durationMs / 1000) : undefined}
          aria-valuenow={Math.round(elapsedMs / 1000)}
          aria-valuetext={
            known ? `${formatPlaybackTime(elapsedMs)} of ${formatPlaybackTime(durationMs)}` : 'Length not known yet'
          }
          aria-disabled={!known}
          onClick={event => {
            const rect = trackRef.current?.getBoundingClientRect();
            if (!known || !rect || rect.width <= 0) return;
            seekTo(((event.clientX - rect.left) / rect.width) * durationMs);
          }}
          onKeyDown={event => {
            if (!known) return;
            if (event.key === 'ArrowRight') seekTo(elapsedMs + SEEK_STEP_MS);
            else if (event.key === 'ArrowLeft') seekTo(elapsedMs - SEEK_STEP_MS);
            else if (event.key === 'Home') seekTo(0);
            else if (event.key === 'End') seekTo(durationMs);
            else return;
            event.preventDefault();
          }}
          className="absolute inset-0 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-white/35" />
          <span
            data-testid="debate-progress"
            className="absolute top-1/2 left-0 h-[3px] -translate-y-1/2 rounded-full bg-white"
            style={{ width: `${fraction * 100}%` }}
          />
        </div>
        {/* Siblings of the slider, not children: a slider's children are presentational to
            assistive tech. A 24px hit area each around a small mark. */}
        {markers.map(marker => {
          const position = moments.findIndex(m => m.momentIndex === marker.momentIndex);
          const target = moments[position];
          return (
            <button
              key={marker.momentIndex}
              type="button"
              aria-label={`Jump to moment ${position + 1}`}
              onClick={() => {
                if (target?.cutStartMs != null) onSeek(target.cutStartMs, position);
              }}
              className="absolute top-1/2 grid size-6 -translate-x-1/2 -translate-y-1/2 cursor-pointer place-items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              style={{ left: `${marker.fraction * 100}%` }}
            >
              <span className="size-1.5 rounded-full bg-white ring-2 ring-black/40" />
            </button>
          );
        })}
      </div>
      <span className="text-[clamp(10px,3.6cqw,13px)] leading-none tabular-nums">
        {formatPlaybackTime(elapsedMs)} / {known ? formatPlaybackTime(durationMs) : '–:––'}
      </span>
    </div>
  );
}

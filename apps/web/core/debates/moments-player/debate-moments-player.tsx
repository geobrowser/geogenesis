'use client';

import * as React from 'react';

import cx from 'classnames';

import { reattachVideoSource, releaseVideo } from '~/core/utils/video/release-video';

import { Avatar } from '~/design-system/avatar';

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
 * Play button after the first one. Nothing is fetched ahead: geo-chat signs each clip redirect
 * afresh, so a second element's download could never be reused, and before a press the element
 * reads only metadata.
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
  /**
   * Called when the viewer starts this player: once per press of play, not again as the reel plays
   * on into the next moment or into the full debate.
   */
  onPlay?: () => void;
  /**
   * Who is in the top (slot 1) and bottom (slot 2) halves of a moment, drawn over them as the
   * debates app does. Left out, the halves go unlabelled.
   */
  speakers?: { top: MomentsSpeaker | null; bottom: MomentsSpeaker | null } | null;
  /** A small label on the picture, top-left (the compare view's "#2 in your ranking"). */
  badge?: string | null;
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

/**
 * The video is the card (Preston, 12 Nov): a 480 × 578 frame, the shape of a moment clip, with
 * 20px rounding and a soft shadow, the same in both modes so switching never moves anything. Every
 * control sits on the picture: the moment bars along the top, the full debate's rail along the
 * bottom, a label pill top-left, the mode switch top-right.
 */
function PlayerFrame({
  label,
  className,
  mode = 'moments',
  children,
}: {
  label: string;
  className?: string;
  mode?: PlayerMode;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={label} className={cx('@container flex w-full justify-center select-none', className)}>
      <div
        className={cx(
          'relative isolate w-full overflow-hidden rounded-[16px] bg-[#2b2b2b] text-white shadow-[0_1px_0_rgba(0,0,0,0.04),0_8px_22px_rgba(0,0,0,0.12)] md:rounded-[12px]',
          // The full debate is rendered taller (1080 × 1640): its own shape at the same height, so
          // there are no black bands beside it.
          mode === 'full' ? 'aspect-[1080/1640] w-[79%]' : 'aspect-[480/578]'
        )}
      >
        {children}
      </div>
    </section>
  );
}

/** D1's mode pill: small, blurred, top-right under the moment bars; hidden on a phone. */
const MODE_PILL_CLASS =
  'absolute top-5 right-2.5 z-30 rounded-full bg-[rgba(20,20,20,0.5)] px-2 py-[3px] text-[10px] leading-[14px] font-bold text-white backdrop-blur-[6px] transition-colors hover:bg-[rgba(20,20,20,0.7)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white md:hidden';

type StoryProps = Omit<DebateMomentsPlayerProps, 'moments'> & { moments: DebateMoment[] };

function MomentsStory({
  debateId,
  label,
  className,
  moments,
  playbackGroup = DEFAULT_PLAYBACK_GROUP,
  onModeChange,
  onPlay,
  speakers,
  badge,
}: StoryProps) {
  const [story, dispatch] = React.useReducer(storyReducer, moments.length, initialStoryState);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [clipMs, setClipMs] = React.useState(0);
  const [clipDurationMs, setClipDurationMs] = React.useState<number | null>(null);
  const [fullMs, setFullMs] = React.useState(0);
  const [fullDurationMs, setFullDurationMs] = React.useState(0);
  const [failed, setFailed] = React.useState(false);
  /**
   * The reel is moving on to its next moment on its own. A clip that ends fires `pause` before
   * `ended`, and the next one takes a signed redirect and some buffering to start, so `playing` is
   * false for that stretch. It is still one viewing: no Play control over the black frame.
   */
  const [advancing, setAdvancing] = React.useState(false);
  const active = playing || advancing;
  /** Whether the next media to load should start playing: set by every step taken while playing. */
  const autoplayRef = React.useRef(false);
  /** The full debate's seek waiting for its metadata, in ms. */
  const pendingSeekRef = React.useRef<number | null>(null);
  /** The src whose metadata the element has loaded; null while a new one is loading. */
  const metadataSrcRef = React.useRef<string | null>(null);
  /** Set when the viewer presses play, so the `play` that follows is reported to the host once. */
  const viewerStartRef = React.useRef(false);
  /** Set by expand and close, so the control that replaces the pressed one takes focus. */
  const moveFocusRef = React.useRef(false);
  const expandRef = React.useRef<HTMLButtonElement | null>(null);
  const collapseRef = React.useRef<HTMLButtonElement | null>(null);

  const moment = story.mode === 'moments' ? moments[story.index] : undefined;
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
      viewerStartRef.current = false;
      setAdvancing(false);
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

  // Stop and release what this player holds when it goes: React has nulled the ref by cleanup time.
  // Always pause: an `<Activity mode="hidden">` cleans effects up but keeps the element, which would
  // otherwise play on unheard of by the exclusive-playback group. Drop the source only once the
  // element has really left the page: StrictMode's rehearsal unmount keeps it, and comes back.
  React.useEffect(() => {
    const video = videoRef.current;
    return () => {
      if (!video) return;
      // Forget any intent to play on, so a player shown again (Activity) comes back paused.
      autoplayRef.current = false;
      viewerStartRef.current = false;
      video.pause();
      if (!video.isConnected) releaseVideo(video);
    };
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (story.mode === 'moments' && story.finished) {
      autoplayRef.current = true;
      viewerStartRef.current = true;
      dispatch({ type: 'restart' });
      if (story.index === 0) {
        video.currentTime = 0;
        start(video);
      }
      return;
    }
    if (advancing) {
      // Pause pressed while the next moment loads: it stays loaded and doesn't start.
      autoplayRef.current = false;
      viewerStartRef.current = false;
      setAdvancing(false);
      video.pause();
      return;
    }
    if (video.paused) {
      autoplayRef.current = true;
      viewerStartRef.current = true;
      start(video);
    } else {
      autoplayRef.current = false;
      viewerStartRef.current = false;
      video.pause();
    }
  };

  const step = (direction: -1 | 1) => {
    autoplayRef.current = active;
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
    autoplayRef.current = active;
    moveFocusRef.current = true;
    dispatch({ type: 'expand', atMs: moment ? debateTimeForMoment(moment, clipMs) : null });
  };

  const collapse = () => {
    autoplayRef.current = active;
    moveFocusRef.current = true;
    dispatch({ type: 'collapse' });
  };

  const seekFull = (atMs: number, index?: number) => {
    autoplayRef.current = active;
    dispatch({ type: 'seekFull', atMs, index });
  };

  const retry = () => {
    const video = videoRef.current;
    if (!video) return;
    autoplayRef.current = true;
    viewerStartRef.current = true;
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
  // Whose moment it is: the other debater's half goes grey, as the debates app does (slot 1 above).
  const speakingSlot = story.mode === 'moments' ? (moment?.participantSlot ?? null) : null;

  return (
    <PlayerFrame label={label} className={className} mode={story.mode}>
      <video
        ref={videoRef}
        src={src}
        playsInline
        preload="metadata"
        aria-label={
          story.mode === 'moments' ? `${label}: moment ${story.index + 1} of ${story.count}` : `${label}: full debate`
        }
        // The moment clips are the two debaters stacked, the frame's own shape; the full debate is
        // rendered taller, with names and captions burned in, so it is shown whole.
        className="absolute inset-0 size-full object-cover"
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
          setAdvancing(autoplayRef.current);
          if (clipLengthMs !== null) setClipMs(clipLengthMs);
          dispatch({ type: 'clipEnded' });
        }}
        onPlay={() => {
          claim();
          setAdvancing(false);
          setPlaying(true);
          // Only a start the viewer pressed reaches the host. The reel playing on into the next
          // moment, or into the full debate, is the same viewing: a clip that ends fires `pause`
          // before `ended`, so the `playing` state cannot tell these apart.
          if (viewerStartRef.current) {
            viewerStartRef.current = false;
            onPlay?.();
          }
        }}
        onPause={() => setPlaying(false)}
        onError={() => {
          setAdvancing(false);
          setPlaying(false);
          setFailed(true);
        }}
      />

      {/* The debaters, as the debates app labels each half: face, name, side and byline. The full
          debate has them burned in. */}
      {story.mode === 'moments' && (
        <>
          {speakingSlot !== null && (
            <span
              aria-hidden
              data-testid="inactive-speaker"
              className={cx(
                'pointer-events-none absolute inset-x-0 z-[1] h-1/2 bg-[#808080] mix-blend-saturation',
                speakingSlot === 1 ? 'bottom-0' : 'top-0'
              )}
            />
          )}
          {speakers ? (
            <>
              <SpeakerBand speaker={speakers.top} className="top-0" />
              <SpeakerBand speaker={speakers.bottom} className="bottom-0" />
            </>
          ) : null}
        </>
      )}

      {/* Along the top: the moment bars (moments only), then the label pill. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-2 bg-gradient-to-b from-black/30 to-transparent px-2.5 pt-[9px] pb-6">
        {story.mode === 'moments' && story.count > 0 ? (
          <div className="flex gap-[3px]" data-testid="moment-segments">
            {moments.map((m, i) => (
              <span key={m.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/[0.38]">
                <span
                  data-testid={`moment-segment-${i}`}
                  className="block h-full rounded-full bg-white"
                  style={{ width: `${segmentFill(i, story.index, clipMs, clipLengthMs) * 100}%` }}
                />
              </span>
            ))}
          </div>
        ) : null}
        {badge ? (
          <span className="self-start rounded-full bg-black/55 px-2 py-[3px] text-[clamp(10px,3.6cqw,12px)] leading-[1.3] font-semibold text-white backdrop-blur-md">
            {badge}
          </span>
        ) : null}
      </div>

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
        aria-label={active ? 'Pause' : 'Play'}
        onClick={togglePlay}
        className={cx(zoneClass, story.mode === 'moments' ? 'bottom-0 left-[30%] w-[40%]' : 'inset-0')}
      />

      {advancing && !failed && (
        // Only if the next clip is slow: it fades in after a beat, so a quick hand-off shows nothing.
        <span
          aria-hidden="true"
          data-testid="advancing-indicator"
          className="pointer-events-none absolute top-1/2 left-1/2 z-20 size-7 -translate-x-1/2 -translate-y-1/2 animate-[fadeIn_200ms_400ms_ease-out_both]"
        >
          <span className="block size-full animate-spin rounded-full border-2 border-white/30 border-t-white/90" />
        </span>
      )}

      {!active && !failed && (
        // The debates app's transport button: a dark disc with a white glyph over the picture.
        <span
          aria-hidden="true"
          data-testid="play-indicator"
          className="pointer-events-none absolute top-1/2 left-1/2 z-20 grid size-[44px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[rgba(20,20,20,0.5)] text-white backdrop-blur-[6px] md:size-[34px]"
        >
          <svg viewBox="0 0 24 24" className="size-[45%]" aria-hidden>
            <path fill="currentColor" d="M7 4L21 12L7 20Z" />
          </svg>
        </span>
      )}

      {/* The switch between the moments and the full debate: a small pill top-right, on a desktop
          only (Preston's D1, 12 Nov). Only when there are moments to switch back to. */}
      {story.mode === 'moments' && story.count > 0 && (
        <button
          ref={expandRef}
          type="button"
          aria-label="Watch the full debate"
          onClick={expand}
          className={MODE_PILL_CLASS}
        >
          Full debate
        </button>
      )}
      {story.mode === 'full' && story.count > 0 && (
        <button
          ref={collapseRef}
          type="button"
          aria-label="Back to moments"
          onClick={collapse}
          className={MODE_PILL_CLASS}
        >
          Moments
        </button>
      )}
      {story.mode === 'full' && (
        // The full debate's rail, thin along the bottom of the picture, as the debates app draws it.
        <div className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/45 to-transparent px-2.5 pt-6 pb-1.5">
          <FullTimeline elapsedMs={fullMs} durationMs={fullDurationMs} moments={moments} onSeek={seekFull} />
        </div>
      )}

      {story.mode === 'moments' && caption && (
        // As the debates app captions a moment: a black box at the seam between the two debaters.
        <p className="pointer-events-none absolute inset-x-3 top-1/2 z-20 m-0 flex -translate-y-1/2 justify-center">
          <span className="line-clamp-3 rounded-[5px] bg-black/80 px-[7px] py-1 text-center text-[clamp(9px,3.6cqw,13px)] leading-[1.3] font-semibold text-white">
            {caption}
          </span>
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

/** One debater on a moment: who they are and which side they argue (the debates app's identity). */
export type MomentsSpeaker = {
  name: string;
  /** "Agree" / "Disagree". */
  side: string | null;
  byline: string | null;
  avatarUrl: string | null;
  avatarSeed: string;
};

function SpeakerBand({ speaker, className }: { speaker: MomentsSpeaker | null; className: string }) {
  if (!speaker) return null;
  return (
    <div className={cx('pointer-events-none absolute inset-x-0 z-[2] h-1/2', className)}>
      <span className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-b from-transparent to-black/40" />
      <div className="absolute inset-x-3 bottom-2.5 flex min-w-0 items-center gap-2" data-testid="moments-speaker">
        <span className="block size-[clamp(22px,9cqw,34px)] shrink-0 overflow-hidden rounded-full bg-white">
          <Avatar avatarUrl={speaker.avatarUrl} value={speaker.avatarSeed} size={34} />
        </span>
        <span className="flex min-w-0 flex-col [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]">
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate text-[clamp(12px,4.6cqw,14px)] leading-[1.25] font-medium text-white">
              {speaker.name}
            </span>
            {speaker.side ? (
              <span className="shrink-0 text-[clamp(10px,3.6cqw,12px)] font-medium text-white">{speaker.side}</span>
            ) : null}
          </span>
          {speaker.byline ? (
            <span className="truncate text-[clamp(10px,3.6cqw,12px)] leading-[1.3] text-white/80">
              {speaker.byline}
            </span>
          ) : null}
        </span>
      </div>
    </div>
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
    // A thin rail along the bottom of the picture with the time above its right end (D1).
    <div className="flex min-w-0 flex-1 flex-col items-stretch text-[10px] leading-none font-semibold tabular-nums [text-shadow:0_1px_2px_rgba(0,0,0,0.5)]">
      <span className="self-end @max-[160px]:hidden">
        <span data-testid="debate-elapsed">{formatPlaybackTime(elapsedMs)}</span>
        {' / '}
        <span data-testid="debate-duration">{known ? formatPlaybackTime(durationMs) : '–:––'}</span>
      </span>
      <div className="relative h-4 min-w-0">
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
              <span className="size-1.5 rounded-full bg-white" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

'use client';

import * as React from 'react';

import cx from 'classnames';

import { capture } from '~/core/analytics';
import { useDebateMoments } from '~/core/debates/hooks';
import { type DebateMoment, momentSubtitleAt, topMoment } from '~/core/debates/moments';

import { Play, Speaker, SpeakerMuted } from './icons';
import { type DebateOpening, debateOpeningFor, hasSeenOpeningClip, markOpeningClipSeen } from './opening-clip';

/**
 * How long an active card waits on its moment list before giving up and playing as it did before.
 *
 * The list is read as the card comes near, so it is almost always in hand on arrival; this is only
 * for the slow or failed read, where holding the debate any longer costs more than the clip adds.
 */
export const OPENING_CLIP_WAIT_MS = 1_500;

/** How the opening clip ended, in `debate_moment_ended`'s words. */
export type OpeningClipEnd = 'completed' | 'switched_to_full' | 'skipped' | 'left';

export type OpeningClipPhase =
  /** This play opens on the title card: switched off, seen before, a linked moment, or no clip. */
  | 'off'
  /** Waiting on the moment list. An active card holds the debate meanwhile. */
  | 'waiting'
  | 'clip'
  /** The clip has ended, one way or another, and the full debate has the player. */
  | 'done';

type OpeningState = {
  debateId: string;
  /** Decided once per debate, on first render, so the clip ending cannot make it eligible again. */
  eligible: boolean;
  started: boolean;
  done: boolean;
};

const initialState = (debateId: string, linkedMoment: boolean): OpeningState => ({
  debateId,
  eligible: !linkedMoment && debateOpeningFor(debateId) === 'moment' && !hasSeenOpeningClip(debateId),
  started: false,
  done: false,
});

/**
 * Whether this debate's first play opens on its most engaging moment (GEO-3578), and where that is.
 *
 * `linkedMoment` is a link that named a moment (`?t=`): the reader was sent to a point in the
 * debate, so the clip would only be in the way.
 */
export function useOpeningClip({
  debateId,
  active,
  near,
  linkedMoment,
}: {
  debateId: string;
  active: boolean;
  /** Close enough to be reached soon: the list is read from here on, so arrival does not wait. */
  near: boolean;
  linkedMoment: boolean;
}) {
  const [state, setState] = React.useState(() => initialState(debateId, linkedMoment));
  // The feed hands one player a different debate on a re-rank, which is a fresh opening.
  const current = state.debateId === debateId ? state : initialState(debateId, linkedMoment);
  if (current !== state) setState(current);

  const moments = useDebateMoments(debateId, current.eligible && !current.done && (near || active));
  const moment: DebateMoment | null = React.useMemo(() => topMoment(moments.data ?? []), [moments.data]);

  const [gaveUp, setGaveUp] = React.useState<string | null>(null);
  const phase: OpeningClipPhase = !current.eligible
    ? 'off'
    : current.done
      ? 'done'
      : moment
        ? 'clip'
        : moments.isError || moments.isSuccess || gaveUp === debateId
          ? 'off'
          : 'waiting';

  React.useEffect(() => {
    if (!active || phase !== 'waiting') return;
    const timer = window.setTimeout(() => setGaveUp(debateId), OPENING_CLIP_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [active, debateId, phase]);

  const update = React.useCallback(
    (patch: Partial<OpeningState>) =>
      setState(previous => (previous.debateId === debateId ? { ...previous, ...patch } : previous)),
    [debateId]
  );

  return {
    phase,
    moment: phase === 'clip' ? moment : null,
    /** An active card does not start the full debate while this is true. */
    holdsDebate: active && (phase === 'waiting' || phase === 'clip'),
    /** What this play opened on, for analytics: the clip only once it has actually played. */
    opening: (current.started ? 'moment' : 'title_card') as DebateOpening,
    markStarted: React.useCallback(() => {
      markOpeningClipSeen(debateId);
      update({ started: true });
    }, [debateId, update]),
    /** The clip is over: the full debate takes the player. */
    finish: React.useCallback(() => update({ done: true }), [update]),
  };
}

type DebateOpeningClipProps = {
  debateId: string;
  moment: DebateMoment;
  active: boolean;
  muted: boolean;
  /** The browser would only play the clip muted; the shared mute preference should say so. */
  onForcedMute: () => void;
  /** Shares the player's instance, so the clip and the debate after it join up in analytics. */
  playbackInstanceId: string;
  onStarted: () => void;
  /** How the clip ended. `null`: it never started, and the debate plays as it did before. */
  onEnded: (end: OpeningClipEnd | null) => void;
  /** The viewer pressing mute or unmute: the player's shared preference, which the debate keeps. */
  onToggleMute: () => void;
};

/**
 * The opening clip, over the whole player: the moment's own file, with its subtitles drawn the way
 * the debate's are, a Skip, and a progress line.
 *
 * Covers the player rather than replacing its <video> elements: the debate keeps its recordings,
 * URLs and pair hold underneath, so the clip ending hands over to a player that is already loaded.
 * The clip file is both debaters stacked at 480×578, the same shape as the player's two tiles.
 */
export function DebateOpeningClip({
  debateId,
  moment,
  active,
  muted,
  onForcedMute,
  playbackInstanceId,
  onStarted,
  onEnded,
  onToggleMute,
}: DebateOpeningClipProps) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [positionMs, setPositionMs] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const durationMs = moment.durationMs;
  const progress = React.useRef({ started: false, ended: false, furthestMs: 0 });

  const end = (reason: OpeningClipEnd | null) => {
    if (progress.current.ended) return;
    progress.current.ended = true;
    if (reason && progress.current.started) {
      try {
        capture('debate_moment_ended', {
          measurement_version: 'growth-v2',
          debate_id: debateId,
          moment_id: moment.id,
          moment_index: moment.momentIndex,
          moment_role: 'opening',
          asset_kind: 'moment',
          playback_instance_id: playbackInstanceId,
          end_reason: reason,
          furthest_ms: Math.round(progress.current.furthestMs),
          moment_duration_ms: durationMs ?? Math.round((videoRef.current?.duration ?? 0) * 1000),
          muted: videoRef.current?.muted ?? muted,
        });
      } catch {
        /* Playback stays usable. */
      }
    }
    onEnded(reason);
  };
  const endRef = React.useRef(end);
  endRef.current = end;

  // Plays while this is the active card. Refused with sound, it tries once more muted, as the
  // debate's own autoplay does (GEO-2783); refused even muted, the clip is dropped for this play.
  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!active) {
      video.pause();
      // Moved on mid-clip: the clip has been seen, and coming back should find the debate.
      if (progress.current.started) endRef.current('skipped');
      return;
    }
    let cancelled = false;
    const giveUp = () => {
      if (!cancelled) endRef.current(null);
    };
    void video.play().catch(() => {
      if (cancelled) return;
      if (video.muted) return giveUp();
      video.muted = true;
      onForcedMute();
      void video.play().catch(giveUp);
    });
    return () => {
      cancelled = true;
    };
    // `onForcedMute` is the player's setter and stable in practice; re-running on it would replay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, endRef, progress]);

  React.useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  // The card unmounting mid-clip. Only once it has started, so a mount that React tears straight
  // down again (Strict Mode, a re-rank) does not end a clip nobody saw.
  React.useEffect(
    () => () => {
      if (progress.current.started) endRef.current('left');
    },
    []
  );

  const togglePause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
  };

  const subtitle = momentSubtitleAt(moment.subtitles, positionMs);
  const fraction = durationMs ? Math.min(1, positionMs / durationMs) : 0;

  return (
    <div data-opening-clip className="absolute inset-0 z-40 bg-black">
      <video
        ref={videoRef}
        src={moment.clipUrl}
        muted={muted}
        playsInline
        // The file is a few hundred KB, so the card about to be reached loads all of it.
        preload="auto"
        aria-label="Debate highlight"
        className="size-full cursor-pointer object-cover"
        onClick={togglePause}
        onPlaying={() => {
          setPaused(false);
          if (!progress.current.started) {
            progress.current.started = true;
            onStarted();
          }
        }}
        onPause={() => setPaused(true)}
        onTimeUpdate={event => {
          const ms = event.currentTarget.currentTime * 1000;
          progress.current.furthestMs = Math.max(progress.current.furthestMs, ms);
          setPositionMs(ms);
        }}
        onEnded={() => end('completed')}
        onError={() => end(progress.current.started ? 'completed' : null)}
      />

      {/* Where the debate's own mute control sits, so it is found in the same place. The element is
        unmuted inside the tap itself: iOS lets a video make sound only from a gesture made on it. */}
      <button
        type="button"
        aria-label={muted ? 'Unmute' : 'Mute'}
        onClick={event => {
          event.stopPropagation();
          if (videoRef.current) videoRef.current.muted = !muted;
          onToggleMute();
        }}
        className="absolute top-3 left-3 z-10 grid size-10.5 place-items-center rounded-full bg-white text-text shadow-light [&>svg]:scale-[1.3]"
      >
        {muted ? <SpeakerMuted /> : <Speaker />}
      </button>

      {/* The debate's own subtitle treatment, on the seam between the stacked debaters. */}
      {subtitle && (
        <span className="pointer-events-none absolute top-1/2 left-1/2 z-10 w-max max-w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-sm bg-black/78 px-1.5 py-1.5 text-center text-[1rem] leading-tight text-white [text-box:trim-both_cap_alphabetic] md:max-w-[90%]">
          {subtitle}
        </span>
      )}

      {paused && progress.current.started && (
        <button
          type="button"
          aria-label="Resume highlight"
          onClick={togglePause}
          className="absolute top-1/2 left-1/2 z-10 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-text shadow-card"
        >
          <Play />
        </button>
      )}

      <button
        type="button"
        onClick={event => {
          event.stopPropagation();
          end('switched_to_full');
        }}
        className="absolute right-3 bottom-4 z-10 rounded-full bg-black/60 px-3 py-1.5 text-[0.875rem] leading-tight font-medium text-white backdrop-blur-sm hover:bg-black/75"
      >
        Skip to full debate
      </button>

      <div aria-hidden className="absolute inset-x-0 bottom-0 z-10 h-1 bg-white/25">
        <div
          className={cx('h-full bg-white', 'transition-[width] duration-250 ease-linear motion-reduce:transition-none')}
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
    </div>
  );
}

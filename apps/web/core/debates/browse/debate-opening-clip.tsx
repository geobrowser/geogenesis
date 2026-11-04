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

/** The crossfade from the clip to the debate, and from the stills to the clip. */
export const OPENING_CLIP_FADE_MS = 300;

/**
 * The longest the clip's last frame waits for the debate to start before fading anyway.
 *
 * Long enough for a held card's recordings to attach and buffer on a slow connection; past it, the
 * player's own loading state is more honest than a frozen frame.
 */
export const OPENING_HANDOVER_MAX_MS = 8_000;

/** Watched this far, a clip the viewer moved on from counts as seen. */
const SEEN_FRACTION = 0.75;

/** How the opening clip ended, in `debate_moment_ended`'s words. */
export type OpeningClipEnd = 'completed' | 'switched_to_full' | 'skipped' | 'left';

export type OpeningClipPhase =
  /** This play opens on the title card: switched off, seen before, a linked moment, or no clip. */
  | 'off'
  /** Waiting on the moment list. An active card holds the debate meanwhile. */
  | 'waiting'
  | 'clip'
  /**
   * The clip has ended into the debate. Its last frame stays up while the debate starts underneath,
   * then crossfades away, so the viewer never sees the player between the two.
   */
  | 'handover'
  /** The full debate has the player. */
  | 'done';

type OpeningState = {
  debateId: string;
  /** Decided once per debate, on first render, so the clip ending cannot make it eligible again. */
  eligible: boolean;
  started: boolean;
  handingOver: boolean;
  done: boolean;
  /** The moment list took too long, so this play opens as before even if it arrives later. */
  gaveUp: boolean;
};

const initialState = (debateId: string, linkedMoment: boolean): OpeningState => ({
  debateId,
  eligible: !linkedMoment && debateOpeningFor(debateId) === 'moment' && !hasSeenOpeningClip(debateId),
  started: false,
  handingOver: false,
  done: false,
  gaveUp: false,
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

  const phase: OpeningClipPhase = !current.eligible
    ? 'off'
    : current.done
      ? 'done'
      : current.handingOver
        ? 'handover'
        : // Checked before the moment: a list that lands after the debate started must not cut it off.
          current.gaveUp
          ? 'off'
          : moment
            ? 'clip'
            : moments.isError || moments.isSuccess
              ? 'off'
              : 'waiting';

  const update = React.useCallback(
    (patch: Partial<OpeningState>) =>
      setState(previous => (previous.debateId === debateId ? { ...previous, ...patch } : previous)),
    [debateId]
  );

  React.useEffect(() => {
    if (!active || phase !== 'waiting') return;
    const timer = window.setTimeout(() => update({ gaveUp: true }), OPENING_CLIP_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [active, phase, update]);

  return {
    phase,
    moment: phase === 'clip' || phase === 'handover' ? moment : null,
    /** An active card does not start the full debate while this is true. */
    holdsDebate: active && (phase === 'waiting' || phase === 'clip'),
    /**
     * The debate should be loaded now, though not played: the clip is on screen and will hand over
     * to it. What makes the handover seamless on a card that otherwise holds its recordings.
     */
    preloadsDebate: active && (phase === 'clip' || phase === 'handover'),
    /** What this play opened on, for analytics: the clip only once it has actually played. */
    opening: (current.started ? 'moment' : 'title_card') as DebateOpening,
    markStarted: React.useCallback(() => update({ started: true }), [update]),
    /**
     * The clip is over. Played through or skipped, it is seen and hands over to the debate; moved on
     * from, it is seen only if most of it played, and nothing hands over.
     */
    end: React.useCallback(
      (end: OpeningClipEnd | null, watchedFraction: number) => {
        const intoDebate = end === 'completed' || end === 'switched_to_full';
        if (intoDebate || (end !== null && watchedFraction >= SEEN_FRACTION)) markOpeningClipSeen(debateId);
        update(intoDebate ? { handingOver: true } : { done: true });
      },
      [debateId, update]
    ),
    /** The debate has the player; the clip can go. */
    finish: React.useCallback(() => update({ done: true }), [update]),
  };
}

type DebateOpeningClipProps = {
  debateId: string;
  moment: DebateMoment;
  active: boolean;
  muted: boolean;
  /**
   * The clip has ended into the debate: hold its last frame with no controls, and fade out once
   * `leaving` — when the debate is playing underneath.
   */
  handingOver: boolean;
  leaving: boolean;
  /** The browser would only play the clip muted; the shared mute preference should say so. */
  onForcedMute: () => void;
  /** Shares the player's instance, so the clip and the debate after it join up in analytics. */
  playbackInstanceId: string;
  onStarted: () => void;
  /**
   * How the clip ended and how much of it played. `null`: it never started, and the debate plays as
   * it did before.
   */
  onEnded: (end: OpeningClipEnd | null, watchedFraction: number) => void;
  /** The viewer pressing mute or unmute: the player's shared preference, which the debate keeps. */
  onToggleMute: () => void;
};

/**
 * The opening clip, over the whole player: the moment's own file, with its subtitles drawn the way
 * the debate's are, a Skip, and a progress line.
 *
 * Covers the player rather than replacing its <video> elements: the debate keeps its recordings,
 * URLs and pair hold underneath, and loads while the clip plays, so the clip ending hands over to a
 * player that is ready. The clip file is both debaters stacked at 480×578, the same shape as the
 * player's two tiles.
 *
 * Transparent until the clip has a frame, so a card waiting on it shows the stills rather than black,
 * and the clip fades in over them.
 */
export function DebateOpeningClip({
  debateId,
  moment,
  active,
  muted,
  handingOver,
  leaving,
  onForcedMute,
  playbackInstanceId,
  onStarted,
  onEnded,
  onToggleMute,
}: DebateOpeningClipProps) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [positionMs, setPositionMs] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const [shown, setShown] = React.useState(false);
  const durationMs = moment.durationMs;
  const progress = React.useRef({ started: false, ended: false, furthestMs: 0 });

  const clipDurationMs = () => durationMs ?? Math.round((videoRef.current?.duration || 0) * 1000);
  const end = (reason: OpeningClipEnd | null) => {
    if (progress.current.ended) return;
    progress.current.ended = true;
    const total = clipDurationMs();
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
          moment_duration_ms: total,
          muted: videoRef.current?.muted ?? muted,
        });
      } catch {
        /* Playback stays usable. */
      }
    }
    onEnded(reason, total > 0 ? progress.current.furthestMs / total : 0);
  };
  const endRef = React.useRef(end);
  endRef.current = end;

  // Plays while this is the active card, and only pauses when it is not: a viewer who scrolls past
  // and comes back picks the clip up where they left it. Refused with sound, it tries once more
  // muted, as the debate's own autoplay does (GEO-2783); refused even muted, the clip is dropped.
  React.useEffect(() => {
    const video = videoRef.current;
    if (!video || handingOver) return;
    if (!active) {
      video.pause();
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
  }, [active, handingOver]);

  React.useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  // Leaving the page mid-clip, or the card leaving the feed's window (moved on from): reported once,
  // and only for a clip that started, so a mount React tears straight down again (Strict Mode, a
  // re-rank) does not end a clip nobody saw.
  React.useEffect(() => {
    const leave = () => {
      if (progress.current.started) endRef.current('left');
    };
    window.addEventListener('pagehide', leave);
    return () => {
      window.removeEventListener('pagehide', leave);
      if (progress.current.started) endRef.current('skipped');
    };
  }, []);

  const togglePause = () => {
    const video = videoRef.current;
    if (!video || handingOver) return;
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
  };

  const subtitle = handingOver ? null : momentSubtitleAt(moment.subtitles, positionMs);
  const fraction = durationMs ? Math.min(1, positionMs / durationMs) : 0;
  const controls = shown && !handingOver;

  return (
    <div
      data-opening-clip
      data-opening-clip-state={handingOver ? 'handover' : shown ? 'playing' : 'loading'}
      style={{ transitionDuration: `${OPENING_CLIP_FADE_MS}ms` }}
      className={cx(
        'absolute inset-0 z-40 bg-black transition-opacity ease-out motion-reduce:transition-none',
        shown && !leaving ? 'opacity-100' : 'pointer-events-none opacity-0'
      )}
    >
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
          setShown(true);
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

      {controls && (
        <>
          {/* Where the debate's own mute control sits, so it is found in the same place. The element
            is unmuted inside the tap itself: iOS lets a video make sound only from a gesture made on
            it. */}
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

          {paused && active && (
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
              className="h-full bg-white transition-[width] duration-250 ease-linear motion-reduce:transition-none"
              style={{ width: `${fraction * 100}%` }}
            />
          </div>
        </>
      )}

      {/* The debate's own subtitle treatment, on the seam between the stacked debaters. */}
      {subtitle && (
        <span className="pointer-events-none absolute top-1/2 left-1/2 z-10 w-max max-w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-sm bg-black/78 px-1.5 py-1.5 text-center text-[1rem] leading-tight text-white [text-box:trim-both_cap_alphabetic] md:max-w-[90%]">
          {subtitle}
        </span>
      )}
    </div>
  );
}

'use client';

import * as React from 'react';

import cx from 'classnames';

import type { Debate, DebateParticipant } from '~/core/debates/api';
import { type TurnState, clampSeconds, speakerLabel } from '~/core/debates/playback-utils';
import { useDebatePlayback } from '~/core/debates/use-debate-playback';
import type { DebateVotesResult } from '~/core/debates/use-debate-votes';
import { usePlaybackAnalytics } from '~/core/debates/use-playback-analytics';
import { useEntitySidePanel } from '~/core/hooks/use-entity-side-panel';
import { useSpace } from '~/core/hooks/use-space';
import { releaseVideo } from '~/core/utils/video/release-video';

import { Avatar } from '~/design-system/avatar';
import { RetrySmall } from '~/design-system/icons/retry-small';
import { Text } from '~/design-system/text';

import { ClaimScrubberMarkers, DebateClaimTickerStack, useDebateClaimTicker } from './debate-claim-ticker';
import { DebateScorecard } from './debate-scorecard';
import { Pause, Play, Speaker, SpeakerMuted } from './icons';
import type { ClaimMarker } from '~/core/debates/claim-ticker';

type DebateFeedPlayerProps = {
  debate: Debate;
  active: boolean;
  /**
   * Load this debate's recordings without playing them — for the card the viewer is about to
   * reach. Resolving the two signed URLs is a round trip each, and until they land
   * `DebateFeedPlayer` renders the "Loading…" placeholder instead of a <video>, which is what
   * makes arriving at a card feel glitchy (GEO-2895).
   */
  preload?: boolean;
  votes: DebateVotesResult;
};

export function DebateFeedPlayer({ debate, active, preload = false, votes }: DebateFeedPlayerProps) {
  const { hasVoted } = votes;
  // Loading is deliberately wider than playing. `useDebatePlayback`'s flag gates only the URL
  // fetch and the transcript query — playback is driven by `active` in the effect below — so a
  // preloading card fetches without autoplaying off-screen.
  const controller = useDebatePlayback(debate, active || preload);
  const measurement = usePlaybackAnalytics(debate, active, controller);
  const {
    slot1VideoRef,
    slot2VideoRef,
    slot1Participant,
    slot2Participant,
    urls,
    ready,
    error,
    playing,
    userPaused,
    isScrubbing,
    isResuming,
    playbackEnded,
    mutedByUser,
    setMutedByUser,
    playheadSeconds,
    timelineSeconds,
    turnState,
    subtitle,
    onPlaybackTick,
    togglePlayback: togglePlaybackRaw,
    playFromStart: playFromStartRaw,
    resumeBoth,
    suspend,
    seekBoth: seekBothRaw,
    beginScrub,
    endScrub,
  } = controller;
  const togglePlayback = () => {
    measurement.control(playing ? 'pause' : playbackEnded ? 'replay' : 'play');
    togglePlaybackRaw();
  };
  const playFromStart = () => {
    measurement.control('replay');
    void playFromStartRaw();
  };
  const seekBoth = (seconds: number) => {
    measurement.control('seek');
    seekBothRaw(seconds);
  };

  // Autoplay the debate that's in view; pause the rest. Respect an explicit
  // user pause so scrolling back doesn't fight the viewer, and don't resume
  // mid-scrub.
  React.useEffect(() => {
    if (!ready) return;
    if (active && !userPaused && !isScrubbing && !playing && !playbackEnded) {
      void resumeBoth();
    } else if (!active && playing) {
      suspend();
    }
  }, [active, isScrubbing, playbackEnded, playing, ready, resumeBoth, suspend, userPaused]);

  // The live claim layer. Loaded alongside the recordings so a card is ready the moment the claim
  // it belongs to is spoken, rather than appearing a beat late on the first one.
  const ticker = useDebateClaimTicker(debate, playheadSeconds * 1000, active || preload);

  const showControls = ready && (userPaused || (playbackEnded && !hasVoted));
  // The two overlay controls sit at full strength whenever the debate is not running, and recede to
  // hover-only while it is. Feed debates autoplay muted, so the mute control is the exception: it
  // stays up during playback while muted, because otherwise there is no way to find the audio.
  const recede = 'opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100';
  const idle = !playing || playbackEnded;

  return (
    // No gap and one radius on the outside: the two tiles are a single surface in the Figma frame,
    // which is what lets the subtitle straddle the seam instead of sitting inside one of them.
    <div ref={measurement.elementRef} className="group relative flex flex-col overflow-hidden rounded-xl">
      <DebaterVideo
        participant={slot1Participant}
        src={urls.slot1}
        videoRef={slot1VideoRef}
        audible={playing && turnState?.slot === 1}
        countdown={playing && turnState?.slot === 1 ? turnState : null}
        mutedByUser={mutedByUser}
        isResuming={isResuming}
        onPlaybackTick={onPlaybackTick}
        onToggle={togglePlayback}
        topLeft={
          ready ? (
            <>
              <ControlCircle
                ariaLabel={playing ? 'Pause debate' : playbackEnded ? 'Replay debate' : 'Play debate'}
                onClick={playbackEnded ? playFromStart : togglePlayback}
                className={idle ? undefined : recede}
              >
                {playing ? <Pause size={15} /> : playbackEnded ? <RetrySmall /> : <Play size={15} />}
              </ControlCircle>
              <ControlCircle
                ariaLabel={mutedByUser ? 'Unmute' : 'Mute'}
                onClick={() => {
                  measurement.control(mutedByUser ? 'unmute' : 'mute');
                  setMutedByUser(current => !current);
                }}
                className={mutedByUser || idle ? undefined : recede}
              >
                {mutedByUser ? <SpeakerMuted size={20} /> : <Speaker size={20} />}
              </ControlCircle>
            </>
          ) : null
        }
      />
      <DebaterVideo
        participant={slot2Participant}
        src={urls.slot2}
        videoRef={slot2VideoRef}
        audible={playing && turnState?.slot === 2}
        countdown={playing && turnState?.slot === 2 ? turnState : null}
        mutedByUser={mutedByUser}
        isResuming={isResuming}
        onPlaybackTick={onPlaybackTick}
        onToggle={togglePlayback}
        // Taller than the top tile's, per the frame: this is the half the claim stack sits over.
        scrimClassName="h-[4.625rem]"
        scrubber={
          ready ? (
            // Always available so the viewer can seek. During playback it recedes to
            // hover-only and drops pointer-events so it can't swallow play/pause taps.
            <div
              className={cx(
                'transition-opacity',
                showControls
                  ? 'opacity-100'
                  : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100'
              )}
            >
              <FeedScrubber
                currentTime={playheadSeconds}
                duration={timelineSeconds}
                markers={ticker.markers}
                onSeek={seekBoth}
                onScrubStart={beginScrub}
                onScrubEnd={endScrub}
              />
            </div>
          ) : null
        }
      />

      {/* One stack for the whole player, in the bottom-left corner, whoever is speaking. The card
          names its own speaker now, so it does not have to be parked over their tile to attribute —
          and a fixed corner means a claim does not jump between halves mid-sentence.

          Capped at the 209px the frame draws it at. The explore card is 484px wide, where 43% comes
          out at exactly that; the fullscreen player is far wider, and letting the card scale with it
          would hold a paragraph and stop being a glance. */}
      {!playbackEnded && ticker.cards.length > 0 && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 w-[43%] max-w-[13.0625rem]">
          <DebateClaimTickerStack
            cards={ticker.cards}
            participantByClaimId={ticker.participantByClaimId}
            rowsByClaimId={ticker.rowsByClaimId}
            entitiesByClaimId={ticker.entitiesByClaimId}
            onAnswered={ticker.onAnswered}
          />
        </div>
      )}

      {/* Straddling the seam between the tiles, which is the one strip of the player that is never
          a face — and the one place it cannot land on top of the claim stack. */}
      {subtitle && (
        <span className="pointer-events-none absolute top-1/2 left-1/2 z-20 max-w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-sm bg-black/78 px-1.5 py-1 text-center text-[1rem] leading-tight text-white">
          {subtitle}
        </span>
      )}

      {/* Dimmed behind, so the card reads as the moment the debate arrives at rather than a note
          stuck over two frozen faces. */}
      {ready && playbackEnded && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 px-3">
          <DebateScorecard debate={debate} ticker={ticker} votes={votes} onReplay={playFromStart} />
        </div>
      )}

      {error && (
        <Text as="p" variant="metadata" color="red-01" className="absolute inset-x-0 -bottom-6 text-center">
          {error}
        </Text>
      )}
    </div>
  );
}

function DebaterVideo({
  participant,
  src,
  videoRef,
  audible,
  countdown,
  mutedByUser,
  isResuming,
  onPlaybackTick,
  onToggle,
  topLeft,
  scrubber,
  scrimClassName = 'h-14',
}: {
  participant: DebateParticipant | null;
  src: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  audible: boolean;
  countdown: TurnState;
  mutedByUser: boolean;
  isResuming: boolean;
  onPlaybackTick: () => void;
  onToggle: () => void;
  topLeft?: React.ReactNode;
  scrubber?: React.ReactNode;
  scrimClassName?: string;
}) {
  const { openSidePanel } = useEntitySidePanel();
  const name = participant ? speakerLabel(participant) : 'Debater';

  const muted = !audible || mutedByUser;

  /**
   * Re-assert the rendered mute after a resume (GEO-2947).
   *
   * `playBothWithMutedFallback` mutes both elements to retry a blocked play and cannot put them
   * back: it does not know what this component renders `muted` from, and anything it captured is
   * a confirm window out of date by the time it could write it. React will not repair that either
   * — it writes a DOM property only when its *own* previous value differs, and a mute it never
   * made is invisible to it — so the element would play audibly under a UI showing muted.
   *
   * Not while a resume is confirming: the retry depends on the mute it just made, and writing over
   * it mid-attempt would block the play this is trying to let happen. `isResuming` falling is
   * itself what runs this effect again, so the repair lands the moment the attempt is over.
   *
   * This is why `playFromStart` no longer writes `muted` either. The value it has (`mutedByUser`)
   * is not the value rendered here, so repairing from the hook moved the divergence rather than
   * closing it. `muted` has one owner: this render.
   */
  React.useLayoutEffect(() => {
    const video = videoRef.current;
    if (!video || isResuming) return;
    video.muted = muted;
  }, [isResuming, muted, src, videoRef]);

  /**
   * Pausing is not enough to return a media decoder or its buffered data on mobile browsers.
   * Detach the source and force the element back to its empty resource state whenever this tile
   * is evicted. The setup repairs the source too because React Strict Mode deliberately exercises
   * an effect cleanup/setup cycle without removing the DOM node in development (GEO-2963).
   */
  React.useLayoutEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    if (video.getAttribute('src') !== src) video.setAttribute('src', src);

    return () => releaseVideo(video);
  }, [src, videoRef]);

  // A personal space's own id resolves to its "system entity" (an ugly technical
  // record). The space's page entity is the real profile, so open that once it's
  // loaded and fall back to the space id while it's still fetching.
  const { space } = useSpace(participant?.profile_space_id);
  const profileEntityId = space?.entity.id || participant?.profile_space_id;

  const openProfile = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (participant && profileEntityId) openSidePanel(profileEntityId, participant.profile_space_id, false);
  };

  return (
    <div className="relative aspect-480/289 w-full overflow-hidden bg-grey-01">
      {/* Clicking anywhere on the video toggles pause/play. */}
      <button type="button" aria-label="Pause or play" onClick={onToggle} className="absolute inset-0 z-0">
        {src ? (
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            playsInline
            preload="metadata"
            src={src}
            // The viewer's own mute — plus the listening debater's, where `volume` is a no-op.
            muted={muted}
            onEnded={onPlaybackTick}
            onLoadedMetadata={onPlaybackTick}
            onPause={onPlaybackTick}
            onPlay={onPlaybackTick}
            onTimeUpdate={onPlaybackTick}
          />
        ) : (
          <div className="grid h-full place-items-center bg-bg text-grey-04">Loading…</div>
        )}
      </button>

      {/* Bottom gradient scrim for legibility of the overlaid controls. All the way to black, per
          the frame — the name that sits on it is regular weight and carries no text shadow. */}
      <div
        className={cx(
          'pointer-events-none absolute inset-x-0 bottom-0 z-1 bg-linear-to-b from-black/0 to-black',
          scrimClassName
        )}
      />

      {topLeft && <div className="absolute top-3 left-3 z-10 flex items-center gap-2">{topLeft}</div>}

      {countdown && <CountdownBadge seconds={countdown.seconds} progress={countdown.progress} />}

      {/* Debater identity, opens their personal space in the side panel. On the right, because the
          left of the bottom band is where the claim stack now lives. */}
      <button
        type="button"
        onClick={openProfile}
        className="absolute right-4 bottom-3 z-10 flex max-w-[55%] items-center gap-2 text-left"
      >
        <span className="block size-5 shrink-0 overflow-hidden rounded-full bg-white">
          <Avatar avatarUrl={participant?.avatar_cid} value={participant?.profile_space_id} size={20} />
        </span>
        <span className="truncate text-[1rem] tracking-[-0.35px] text-white">{name}</span>
      </button>

      {scrubber && <div className="absolute inset-x-0 bottom-0 z-10">{scrubber}</div>}
    </div>
  );
}

function CountdownBadge({ seconds, progress }: { seconds: number; progress: number }) {
  // The ring shows time remaining, so it shrinks as the turn elapses rather than filling up.
  const remaining = 1 - Math.max(0, Math.min(1, progress));
  const degrees = remaining * 360;
  return (
    <div className="absolute top-3 right-3 z-10 grid size-8 place-items-center rounded-full bg-linear-to-b from-black/50 to-black/25">
      <span
        className="col-start-1 row-start-1 size-7 rounded-full"
        style={{
          backgroundImage: `conic-gradient(#ffffff ${degrees}deg, rgba(255,255,255,0.3) 0deg)`,
          // Hollowed into a 2px ring so the badge's own translucent backing shows through the
          // middle. The frame draws a stroked circle; a filled disc would print the number on a
          // grey plate the design does not have.
          maskImage: 'radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))',
          WebkitMaskImage: 'radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))',
        }}
      />
      <span className="col-start-1 row-start-1 grid place-items-center text-[1.0625rem] leading-none font-medium text-white tabular-nums">
        {Math.ceil(seconds)}
      </span>
    </div>
  );
}

function ControlCircle({
  children,
  ariaLabel,
  onClick,
  className,
}: {
  children: React.ReactNode;
  ariaLabel: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={event => {
        event.stopPropagation();
        onClick();
      }}
      className={cx('grid size-10 place-items-center rounded-full bg-white text-text shadow-light', className)}
    >
      {children}
    </button>
  );
}

// Only the keys that actually move a range thumb should pause playback. Firing on every
// key means Tab/Shift while the slider is focused would start a scrub whose keyup lands on
// another element, leaving playback stuck paused.
const isScrubKey = (key: string) =>
  key.startsWith('Arrow') || key === 'Home' || key === 'End' || key === 'PageUp' || key === 'PageDown';

function FeedScrubber({
  currentTime,
  duration,
  markers,
  onSeek,
  onScrubStart,
  onScrubEnd,
}: {
  currentTime: number;
  duration: number;
  markers: ClaimMarker[];
  onSeek: (seconds: number) => void;
  onScrubStart: () => void;
  onScrubEnd: () => void;
}) {
  const bounded = clampSeconds(currentTime, duration);
  const progress = duration > 0 ? (bounded / duration) * 100 : 0;
  return (
    <div className="relative flex h-5 items-center px-3 [--track-height:5px]">
      <div className="relative h-(--track-height) w-full overflow-hidden rounded-full bg-white/40">
        <span className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: `${progress}%` }} />
      </div>
      {/* Above the track and below the range input, so a marker is clickable but a drag anywhere
          along the bar still scrubs. */}
      <ClaimScrubberMarkers markers={markers} onSeek={ms => onSeek(ms / 1000)} className="z-1" />
      <span
        className="pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.35)]"
        style={{ left: `calc(12px + ${progress}% * (100% - 24px) / 100%)` }}
      />
      <input
        className="absolute inset-0 z-2 m-0 h-5 w-full cursor-pointer appearance-none bg-transparent opacity-0"
        type="range"
        min="0"
        max={duration > 0 ? duration : 1}
        step="0.05"
        value={bounded}
        aria-label="Debate timeline"
        onChange={event => onSeek(Number(event.currentTarget.value))}
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

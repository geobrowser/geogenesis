'use client';

import * as React from 'react';

import cx from 'classnames';

import type { Debate, DebateParticipant, ParticipantSlot } from '~/core/debates/api';
import { type TurnState, clampSeconds, speakerLabel } from '~/core/debates/playback-utils';
import { useDebatePlayback } from '~/core/debates/use-debate-playback';
import { useEntitySidePanel } from '~/core/hooks/use-entity-side-panel';

import { Avatar } from '~/design-system/avatar';
import { RetrySmall } from '~/design-system/icons/retry-small';
import { Text } from '~/design-system/text';

import { Crown, Pause, SpeakerMuted } from './icons';

type DebateFeedPlayerProps = {
  debate: Debate;
  active: boolean;
  hasVoted: boolean;
  onSelectWinner: (slot: ParticipantSlot) => void;
};

export function DebateFeedPlayer({ debate, active, hasVoted, onSelectWinner }: DebateFeedPlayerProps) {
  const controller = useDebatePlayback(debate, active);
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
    playbackEnded,
    mutedByUser,
    setMutedByUser,
    playheadSeconds,
    timelineSeconds,
    turnState,
    activeSlot,
    subtitle,
    onPlaybackTick,
    togglePlayback,
    playFromStart,
    resumeBoth,
    suspend,
    seekBoth,
  } = controller;

  // Autoplay the debate that's in view; pause the rest. Respect an explicit
  // user pause so scrolling back doesn't fight the viewer.
  React.useEffect(() => {
    if (!ready) return;
    if (active && !userPaused && !playing && !playbackEnded) {
      void resumeBoth();
    } else if (!active && playing) {
      suspend();
    }
  }, [active, playbackEnded, playing, ready, resumeBoth, suspend, userPaused]);

  const showControls = ready && (userPaused || (playbackEnded && !hasVoted));
  // End of an unvoted debate offers a replay; a user pause shows the paused glyph.
  const showReplay = ready && playbackEnded && !hasVoted;
  const showPausedGlyph = ready && userPaused && !playbackEnded;

  return (
    <div className="relative flex flex-col gap-2">
      <DebaterVideo
        participant={slot1Participant}
        src={urls.slot1}
        videoRef={slot1VideoRef}
        isActiveSpeaker={activeSlot === 1}
        audible={playing && turnState?.slot === 1}
        countdown={playing && turnState?.slot === 1 ? turnState : null}
        subtitle={activeSlot === 1 ? subtitle : null}
        mutedByUser={mutedByUser}
        onPlaybackTick={onPlaybackTick}
        onToggle={togglePlayback}
        onSelectWinner={() => onSelectWinner(1)}
        topLeft={
          showReplay ? (
            <ControlCircle ariaLabel="Replay debate" onClick={playFromStart}>
              <RetrySmall />
            </ControlCircle>
          ) : showControls ? (
            <ControlCircle
              ariaLabel={mutedByUser ? 'Unmute' : 'Mute'}
              onClick={() => setMutedByUser(current => !current)}
            >
              <SpeakerMuted />
            </ControlCircle>
          ) : null
        }
      />
      <DebaterVideo
        participant={slot2Participant}
        src={urls.slot2}
        videoRef={slot2VideoRef}
        isActiveSpeaker={activeSlot === 2}
        audible={playing && turnState?.slot === 2}
        countdown={playing && turnState?.slot === 2 ? turnState : null}
        subtitle={activeSlot === 2 ? subtitle : null}
        mutedByUser={mutedByUser}
        onPlaybackTick={onPlaybackTick}
        onToggle={togglePlayback}
        onSelectWinner={() => onSelectWinner(2)}
        scrubber={
          showControls ? (
            <FeedScrubber currentTime={playheadSeconds} duration={timelineSeconds} onSeek={seekBoth} />
          ) : null
        }
      />

      {showPausedGlyph && (
        <button
          type="button"
          aria-label="Resume debate"
          onClick={togglePlayback}
          className="absolute top-1/2 left-1/2 z-20 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-text shadow-card"
        >
          <Pause />
        </button>
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
  isActiveSpeaker,
  audible,
  countdown,
  subtitle,
  mutedByUser,
  onPlaybackTick,
  onToggle,
  onSelectWinner,
  topLeft,
  scrubber,
}: {
  participant: DebateParticipant | null;
  src: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isActiveSpeaker: boolean;
  audible: boolean;
  countdown: TurnState;
  subtitle: string | null;
  mutedByUser: boolean;
  onPlaybackTick: () => void;
  onToggle: () => void;
  onSelectWinner: () => void;
  topLeft?: React.ReactNode;
  scrubber?: React.ReactNode;
}) {
  const { openSidePanel } = useEntitySidePanel();
  const name = participant ? speakerLabel(participant) : 'Debater';

  const openProfile = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (participant) openSidePanel(participant.profile_space_id, participant.profile_space_id, false);
  };

  return (
    <div className="relative aspect-480/289 w-full overflow-hidden rounded-lg bg-grey-01">
      {/* Clicking anywhere on the video toggles pause/play. */}
      <button type="button" aria-label="Pause or play" onClick={onToggle} className="absolute inset-0 z-0">
        {src ? (
          <video
            ref={videoRef}
            className={cx('h-full w-full object-cover', !isActiveSpeaker && 'saturate-0')}
            playsInline
            preload="metadata"
            src={src}
            muted={!audible || mutedByUser}
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

      {/* Bottom gradient scrim for legibility of the overlaid controls. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-1 h-14 bg-linear-to-b from-black/0 to-black/70" />

      {topLeft && <div className="absolute top-3 left-3 z-10">{topLeft}</div>}

      {countdown && <CountdownBadge seconds={countdown.seconds} progress={countdown.progress} />}

      {subtitle && (
        <div className="absolute inset-x-0 bottom-14 z-10 flex justify-center px-4">
          <span className="max-w-[70%] rounded-sm bg-black/78 px-1.5 py-1 text-center text-[1rem] leading-tight text-white">
            {subtitle}
          </span>
        </div>
      )}

      {/* Debater identity: avatar + name + position, opens their home space. */}
      <button
        type="button"
        onClick={openProfile}
        className="absolute bottom-3 left-4 z-10 flex items-center gap-2 text-left"
      >
        <span className="block size-5 shrink-0 overflow-hidden rounded-full bg-white">
          <Avatar avatarUrl={participant?.avatar_cid} value={participant?.profile_space_id} size={20} />
        </span>
        <span className="truncate text-[1rem] font-medium text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.55)]">
          {name}
        </span>
        {participant && (
          <span className="inline-flex h-4 shrink-0 items-center rounded-full bg-white/60 px-1.5 text-[0.75rem] leading-none text-text">
            {participant.position_label}
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={event => {
          event.stopPropagation();
          onSelectWinner();
        }}
        className="absolute right-4 bottom-3 z-10 flex items-center gap-1.5 rounded-full bg-white/40 px-2 py-1.5 text-white backdrop-blur-sm transition-colors hover:bg-white/55"
      >
        <Crown />
        <span className="text-[1rem] leading-none">Winner?</span>
      </button>

      {scrubber && <div className="absolute inset-x-0 bottom-0 z-10">{scrubber}</div>}
    </div>
  );
}

function CountdownBadge({ seconds, progress }: { seconds: number; progress: number }) {
  const degrees = Math.max(0, Math.min(1, progress)) * 360;
  return (
    <div
      className="absolute top-3 right-3 z-10 grid size-8 place-items-center rounded-full text-white"
      style={{ backgroundImage: `conic-gradient(#ffffff ${degrees}deg, rgba(255,255,255,0.28) 0deg)` }}
    >
      <span className="grid size-7 place-items-center rounded-full bg-text/70 text-button">{Math.ceil(seconds)}</span>
    </div>
  );
}

function ControlCircle({
  children,
  ariaLabel,
  onClick,
}: {
  children: React.ReactNode;
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={event => {
        event.stopPropagation();
        onClick();
      }}
      className="grid size-8 place-items-center rounded-full bg-white text-text shadow-light"
    >
      {children}
    </button>
  );
}

function FeedScrubber({
  currentTime,
  duration,
  onSeek,
}: {
  currentTime: number;
  duration: number;
  onSeek: (seconds: number) => void;
}) {
  const bounded = clampSeconds(currentTime, duration);
  const progress = duration > 0 ? (bounded / duration) * 100 : 0;
  return (
    <div className="relative flex h-5 items-center px-3 [--track-height:5px]">
      <div className="relative h-(--track-height) w-full overflow-hidden rounded-full bg-white/40">
        <span className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: `${progress}%` }} />
      </div>
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
      />
    </div>
  );
}

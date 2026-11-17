'use client';

import * as React from 'react';

import cx from 'classnames';

import type { ParticipantSlot } from '../api';
import { BusyDots, ChevronSide, PauseIcon, PlayIcon } from './editor-ui';
import { SPEAKER_FILL_CLASS } from './speaker-classes';

export const PLAYBACK_RATES = [1, 1.5, 2] as const;
export type PlaybackRate = (typeof PLAYBACK_RATES)[number];

/** The combined-video fallback has no handle to drive (§3.8): said instead of dead buttons. */
export const NO_TRANSPORT_REASON = 'Playback controls need the two-camera player';

/**
 * The monitor (GEO-3773): the debate player on a black stage, what it is showing, and the play bar
 * (time, previous clip, play or pause, next clip, speed). The time is written each frame by
 * `timeRef`, never through a render.
 */
export function EditorMonitor({
  player,
  label,
  loading,
  timeRef,
  durationText,
  playing,
  disabled,
  rate,
  notice,
  soundBlocked,
  onUnmute,
  onPrev,
  onNext,
  onPlayPause,
  onRate,
}: {
  player: React.ReactNode;
  /** What the stage shows: "Full debate", "Clip N · Name" or "Reel · clip i of N". */
  label: { text: string; speaker: ParticipantSlot | null };
  /** Between two reel clips while the next one loads. */
  loading: boolean;
  timeRef: React.RefCallback<HTMLElement>;
  durationText: string;
  playing: boolean;
  /** The combined-video fallback: no controls. */
  disabled: boolean;
  rate: PlaybackRate;
  /** One line about the last Play: a stall, clips past the end, the raw span. */
  notice: string | null;
  soundBlocked: boolean;
  onUnmute: () => void;
  onPrev: () => void;
  onNext: () => void;
  onPlayPause: () => void;
  onRate: (rate: PlaybackRate) => void;
}) {
  const stageRef = React.useRef<HTMLDivElement>(null);
  const size = useFitted(stageRef);
  return (
    <div
      role="region"
      aria-label="Debate player"
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg bg-black"
    >
      <div ref={stageRef} className="relative grid min-h-0 flex-1 place-items-center">
        <div
          className="relative overflow-hidden"
          data-player-box
          style={
            size
              ? { width: size.width, height: size.height }
              : { height: '100%', maxWidth: '100%', aspectRatio: PLAYER_ASPECT_CSS }
          }
        >
          {player}
        </div>
        {loading ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black text-white">
            <BusyDots />
            <span role="status" className="text-metadata">
              Loading next clip
            </span>
          </div>
        ) : (
          <span className="absolute top-3 left-3 z-10 inline-flex items-center gap-1.5 rounded-sm bg-black/60 px-2 py-[5px] text-breadcrumb text-white">
            <i
              aria-hidden
              className={cx(
                'h-1.5 w-1.5 rounded-full',
                label.speaker ? SPEAKER_FILL_CLASS[label.speaker] : 'bg-grey-03'
              )}
            />
            {label.text}
          </span>
        )}
        {soundBlocked && !disabled ? (
          <button
            type="button"
            onClick={onUnmute}
            className="absolute top-3 right-3 z-10 inline-flex cursor-pointer items-center gap-1.5 rounded-sm border-0 bg-black/60 px-2 py-[5px] text-breadcrumb text-white hover:bg-black/80"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M2 6h3l4-3v10l-4-3H2z" stroke="currentColor" />
              <path d="M11 6l4 4M15 6l-4 4" stroke="currentColor" />
            </svg>
            Sound blocked — click to unmute
          </button>
        ) : null}
        {notice || disabled ? (
          <span
            role="status"
            className="absolute bottom-3 left-3 z-10 rounded-sm bg-black/60 px-2 py-[5px] text-breadcrumb text-white"
          >
            {disabled ? NO_TRANSPORT_REASON : notice}
          </span>
        ) : null}
      </div>
      <div
        role="group"
        aria-label="Playback"
        className="grid h-10 flex-none grid-cols-[1fr_auto_1fr] items-center border-t border-white/8 bg-text px-3 text-white"
      >
        <span className="text-breadcrumb whitespace-nowrap tabular-nums">
          <span ref={timeRef} data-testid="monitor-time">
            0:00.0
          </span>
          <span className="ml-1.5 font-normal text-grey-03">/ {durationText}</span>
        </span>
        <span className="flex items-center gap-2">
          <BarButton label="Previous clip" disabled={disabled} onClick={onPrev}>
            <ChevronSide direction="left" />
          </BarButton>
          <button
            type="button"
            aria-label={playing ? 'Pause' : 'Play from the playhead'}
            aria-keyshortcuts="Space"
            disabled={disabled}
            onClick={onPlayPause}
            className="inline-grid h-8 w-8 cursor-pointer place-items-center rounded-full border-0 bg-white p-0 text-text hover:bg-grey-02 disabled:cursor-default disabled:opacity-50"
          >
            {playing ? <PauseIcon /> : <PlayIcon nudge />}
          </button>
          <BarButton label="Next clip" disabled={disabled} onClick={onNext}>
            <ChevronSide direction="right" />
          </BarButton>
        </span>
        <span role="group" aria-label="Playback speed" className="inline-flex gap-0.5 justify-self-end">
          {PLAYBACK_RATES.map(option => (
            <button
              key={option}
              type="button"
              aria-pressed={rate === option}
              disabled={disabled}
              onClick={() => onRate(option)}
              className={cx(
                'cursor-pointer rounded border-0 px-[7px] py-[3px] text-breadcrumb font-medium tabular-nums focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white disabled:cursor-default disabled:opacity-50',
                rate === option ? 'bg-white text-text' : 'bg-transparent text-grey-03 hover:bg-white/8 hover:text-white'
              )}
            >
              {option}×
            </button>
          ))}
        </span>
      </div>
    </div>
  );
}

function BarButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-grid h-7 w-7 cursor-pointer place-items-center rounded border-0 bg-transparent p-0 text-grey-03 hover:bg-white/8 hover:text-white disabled:cursor-default disabled:opacity-50"
    >
      {children}
    </button>
  );
}

/**
 * The player's own shape: the feed's two 480 × 289 tiles stacked, one debater over the other, so
 * 480 × 578 (Preston, 16 Nov: the editor shows them as the feed does, not side by side). The stage
 * letterboxes around it in black.
 */
const PLAYER_ASPECT = 480 / 578;
const PLAYER_ASPECT_CSS = '480 / 578';

/** The largest player-shaped box that fits the stage; `null` until measured (and in tests). */
function useFitted(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = React.useState<{ width: number; height: number } | null>(null);
  React.useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const { clientWidth: width, clientHeight: height } = element;
      if (width === 0 || height === 0) return;
      const fitted =
        width / height > PLAYER_ASPECT
          ? { width: height * PLAYER_ASPECT, height }
          : { width, height: width / PLAYER_ASPECT };
      setSize(current =>
        current && Math.abs(current.width - fitted.width) < 0.5 && Math.abs(current.height - fitted.height) < 0.5
          ? current
          : fitted
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

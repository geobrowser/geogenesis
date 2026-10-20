'use client';

import * as React from 'react';

import cx from 'classnames';

import { LABEL_FONT, STAMP_FONT } from './browse/stamp-styles';
import { MutedMicrophoneIndicator } from './debate-room-controls';
import { RoomExit } from './debate-room-stamps';
import { recordingFont } from './recording-overlay-styles';

const COUNTDOWN_SIZE = 51;
const COUNTDOWN_CENTER = COUNTDOWN_SIZE / 2;
const COUNTDOWN_RADIUS = 21;
const COUNTDOWN_CIRCUMFERENCE = 2 * Math.PI * COUNTDOWN_RADIUS;

/** The colour every room countdown turns in its last seconds. */
export const COUNTDOWN_WARNING_COLOR = '#FF4A26';

type RecordingCountdownVariant = 'default' | 'warning' | 'muted';

/**
 * How large the turn timer is drawn in an Open rounds debate's last ten seconds of a turn (GEO-3316):
 * a step bigger with each second's pulse from 10 s, reaching 1.3x as 5 s arrives, then held there.
 * 1 the rest of the time. The room's timer and the published player's share it.
 */
export function turnTimerScale(seconds: number) {
  if (seconds > 10) return 1;
  if (seconds <= 5) return 1.3;
  return 1 + (0.3 * Math.min(5, 11 - Math.ceil(seconds))) / 5;
}

/**
 * Where an Open rounds turn timer is in its last ten seconds, shared by the room's timer and the
 * published player's: `building` from 10 s, growing a step with each pulse; `final` from 5 s, red at
 * its full size. `swell` is the once-a-second pulse's peak, relative to `scale`: the mockup's swell is
 * absolute, 0.08 of the timer's size while it grows and 0.05 once red.
 */
export function turnTimerBuildUp(seconds: number) {
  const counting = seconds <= 10 && seconds > 0;
  const final = counting && seconds <= 5;
  const scale = turnTimerScale(seconds);
  return {
    phase: final ? 'final' : counting ? 'building' : 'steady',
    counting,
    final,
    scale,
    swell: 1 + (final ? 0.05 : 0.08) / scale,
  } as const;
}

/** Grows from the timer's corner, so it stays inside its tile at its largest. */
export const TURN_TIMER_SCALE_CLASS =
  'origin-top-right transition-[scale] duration-[350ms] ease-[cubic-bezier(0.333333,1,0.666667,1)]';

/** The pulse each of the last ten seconds lands with. The red surface carries its own glow. */
export function turnTimerPulseClass(buildUp: ReturnType<typeof turnTimerBuildUp>) {
  return buildUp.counting ? 'motion-safe:animate-[turnTimerPulse_350ms_linear]' : undefined;
}

/** Hollows a disc into a ring `width` thick at its edge. */
export function turnTimerRimMask(width: string) {
  return `radial-gradient(farthest-side, transparent calc(100% - ${width}), #000 calc(100% - ${width}))`;
}

/**
 * A ref whose element's own CSS animations restart each time `tick` changes, without remounting it,
 * so whatever it holds (the timer's rim, mid-drain) carries on. `null` leaves them alone. The room's
 * timer and the published player's both pulse with it.
 */
export function useRestartedEach<T extends HTMLElement>(tick: number | null) {
  const ref = React.useRef<T>(null);
  React.useLayoutEffect(() => {
    const element = ref.current;
    if (tick === null || !element) return;
    // A finished CSS animation is gone from `getAnimations()`, so it cannot be rewound: take the
    // animations off, let the browser see it, and put them back. A child's transition runs on.
    element.style.animation = 'none';
    void element.offsetWidth;
    element.style.animation = '';
  }, [tick]);
  return ref;
}

/** The room's red rim, at the disc's very edge. */
const finalRimMask = turnTimerRimMask('0.55cqw');

export type RecordingCountdownRingProps = {
  remainingSeconds: number;
  progress: number;
  variant: RecordingCountdownVariant;
  /** Use the room's proportional timer during connecting and other shared phases too. */
  openRounds?: boolean;
  /** A speaking turn's exact remaining time; enables the final-ten-second build-up. */
  buildUp?: { remainingMs: number } | null;
  /** Open rounds keeps one circle while the timer hands over to the muted microphone. */
  presentation?: 'timer' | 'microphone';
};

export function RecordingCountdownRing({
  remainingSeconds,
  progress,
  variant,
  buildUp = null,
  openRounds = buildUp !== null,
  presentation = 'timer',
}: RecordingCountdownRingProps) {
  const gradientId = React.useId();
  const elapsedRatio = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  const muted = variant === 'muted';
  const proportional = openRounds || buildUp !== null;
  const microphone = proportional && presentation === 'microphone';
  const stage = turnTimerBuildUp(buildUp ? remainingSeconds : Infinity);
  const { counting, final } = stage;
  const ringColor = muted ? 'rgba(190,190,190,0.92)' : variant === 'warning' ? COUNTDOWN_WARNING_COLOR : '#FFFFFF';
  const numberColor = muted ? 'var(--color-grey-02)' : '#FFFFFF';
  const dashOffset = COUNTDOWN_CIRCUMFERENCE * elapsedRatio;
  const faceRef = useRestartedEach<HTMLDivElement>(counting && !microphone ? remainingSeconds : null);
  const warningRef = useRestartedEach<HTMLDivElement>(final && !microphone ? remainingSeconds : null);
  const rimDegrees = final && buildUp ? (Math.max(0, Math.min(5_000, buildUp.remainingMs)) / 5_000) * 360 : 0;

  const timerContents = (
    <>
      {final ? (
        <span
          aria-hidden="true"
          data-turn-timer-rim
          className="absolute inset-0 rounded-full transition-[--turn-timer-rim] duration-500 ease-linear"
          style={
            {
              '--turn-timer-rim': `${rimDegrees}deg`,
              backgroundImage: 'conic-gradient(#ffffff var(--turn-timer-rim), rgba(255,255,255,0.28) 0deg)',
              maskImage: finalRimMask,
              WebkitMaskImage: finalRimMask,
            } as React.CSSProperties
          }
        />
      ) : proportional ? (
        <span
          aria-hidden="true"
          data-turn-timer-track
          className="absolute size-[calc(100%-4px)] rounded-full transition-[--turn-timer-rim] duration-500 ease-linear"
          style={
            {
              '--turn-timer-rim': `${(1 - elapsedRatio) * 360}deg`,
              backgroundImage: 'conic-gradient(#ffffff var(--turn-timer-rim), rgba(255,255,255,0.3) 0deg)',
              maskImage: turnTimerRimMask('2px'),
              WebkitMaskImage: turnTimerRimMask('2px'),
            } as React.CSSProperties
          }
        />
      ) : (
        <svg viewBox="0 0 51 51" aria-hidden="true" className="absolute inset-0 size-full">
          <defs>
            <linearGradient id={gradientId} x1="25.5" y1="0" x2="25.5" y2="51" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#000000" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.25" />
            </linearGradient>
          </defs>
          <circle
            data-countdown-backdrop
            cx={COUNTDOWN_CENTER}
            cy={COUNTDOWN_CENTER}
            r={COUNTDOWN_CENTER}
            fill={`url(#${gradientId})`}
          />
          <circle
            data-countdown-track
            cx={COUNTDOWN_CENTER}
            cy={COUNTDOWN_CENTER}
            r={COUNTDOWN_RADIUS}
            fill="none"
            stroke="#FFFFFF"
            strokeOpacity="0.6"
            strokeWidth="3"
          />
          <circle
            data-countdown-progress
            cx={COUNTDOWN_CENTER}
            cy={COUNTDOWN_CENTER}
            r={COUNTDOWN_RADIUS}
            fill="none"
            stroke={ringColor}
            strokeWidth="3"
            strokeLinecap="butt"
            strokeDasharray={COUNTDOWN_CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${COUNTDOWN_CENTER} ${COUNTDOWN_CENTER})`}
          />
        </svg>
      )}
      <span
        className="relative z-10"
        style={{
          color: numberColor,
          fontFamily: (final ? STAMP_FONT : proportional ? recordingFont : LABEL_FONT).fontFamily,
          fontSize: proportional ? '4cqw' : 22,
          fontWeight: final ? 700 : 500,
          fontVariantNumeric: proportional ? 'tabular-nums' : undefined,
          lineHeight: 1,
          transform: 'none',
        }}
      >
        {remainingSeconds}
      </span>
    </>
  );

  return (
    <div
      aria-label={microphone ? 'Microphone muted' : `Phase timer: ${remainingSeconds} seconds remaining`}
      data-recording-badge={proportional ? (microphone ? 'microphone' : 'timer') : undefined}
      data-muted-timer={muted ? 'true' : 'false'}
      data-timer-progress={progress}
      data-turn-timer={buildUp && !microphone ? stage.phase : undefined}
      className={cx('relative grid shrink-0 place-items-center', buildUp && TURN_TIMER_SCALE_CLASS)}
      style={{
        width: proportional ? '9cqw' : COUNTDOWN_SIZE,
        height: proportional ? '9cqw' : COUNTDOWN_SIZE,
        ...(buildUp
          ? { scale: microphone ? 1 : stage.scale, transitionDuration: microphone ? '300ms' : undefined }
          : null),
      }}
    >
      <div
        // Its swell and glow restart each second of the last ten (`useRestartedEach`), without
        // remounting, so the rim keeps draining across the second. Reduced motion keeps the colour
        // and the draining rim, without the pulse or the glow.
        ref={faceRef}
        data-recording-badge-face={proportional ? true : undefined}
        className={cx('relative grid size-full place-items-center rounded-full', turnTimerPulseClass(stage))}
        style={
          proportional
            ? ({
                '--turn-timer-swell': microphone ? 1 : stage.swell,
                scale: counting
                  ? 'calc(1 + (var(--turn-timer-swell) - 1) * sin(var(--turn-timer-pulse-angle)))'
                  : undefined,
                backgroundImage: 'linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.25))',
                ...(microphone
                  ? {
                      animationPlayState: 'paused',
                      transition: '--turn-timer-swell 300ms ease-out',
                    }
                  : null),
              } as React.CSSProperties)
            : undefined
        }
      >
        {proportional ? (
          <>
            <div
              ref={warningRef}
              aria-hidden="true"
              data-recording-warning-surface
              className={cx(
                'absolute inset-0 rounded-full bg-[#FF4A26] transition-opacity duration-300 ease-out',
                final && 'motion-safe:animate-[turnTimerGlow_1000ms_linear]'
              )}
              style={{ opacity: final && !microphone ? 1 : 0, transitionDuration: microphone ? '300ms' : '0ms' }}
            />
            <RoomExit
              crossfade
              className="grid place-items-center"
              style={{
                transitionDuration: microphone ? '100ms' : '150ms',
                transitionDelay: microphone ? '0ms' : '100ms',
              }}
            >
              {!microphone && timerContents}
            </RoomExit>
            <RoomExit
              crossfade
              className="grid place-items-center"
              style={{
                transitionDuration: microphone ? '150ms' : '100ms',
                transitionDelay: microphone ? '100ms' : '0ms',
              }}
            >
              {microphone && <MutedMicrophoneIndicator openRounds backdrop={false} />}
            </RoomExit>
          </>
        ) : (
          timerContents
        )}
      </div>
    </div>
  );
}

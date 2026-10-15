'use client';

import * as React from 'react';

import cx from 'classnames';

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

/** The rim of the red timer, at the disc's very edge. */
const FINAL_RIM_PX = 3;
const finalRimMask = `radial-gradient(farthest-side, transparent calc(100% - ${FINAL_RIM_PX}px), #000 calc(100% - ${FINAL_RIM_PX}px))`;

export function RecordingCountdownRing({
  remainingSeconds,
  progress,
  variant,
  buildUp = null,
}: {
  remainingSeconds: number;
  progress: number;
  variant: RecordingCountdownVariant;
  /**
   * An Open rounds turn's last ten seconds, as the published player draws them (GEO-3315): from
   * 10 s the timer pulses once a second and grows a step with each pulse; from 5 s it turns warning
   * red at its full size and holds there, its white rim draining to empty by 0 and each second
   * landing with a swell and a red glow. `remainingMs` is the turn's exact time left, which the rim
   * drains by. `null` keeps today's timer, which every fixed format does.
   */
  buildUp?: { remainingMs: number } | null;
}) {
  const gradientId = React.useId();
  const elapsedRatio = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  const muted = variant === 'muted';
  const counting = buildUp !== null && remainingSeconds <= 10 && remainingSeconds > 0;
  const final = counting && remainingSeconds <= 5;
  const ringColor = muted ? 'rgba(190,190,190,0.92)' : variant === 'warning' ? COUNTDOWN_WARNING_COLOR : '#FFFFFF';
  const numberColor = muted ? 'var(--color-grey-02)' : '#FFFFFF';
  const dashOffset = COUNTDOWN_CIRCUMFERENCE * elapsedRatio;
  const scale = buildUp ? turnTimerScale(remainingSeconds) : 1;
  // The swell's height in the mockup is absolute: 0.08 of the timer's size while it grows, 0.05 once red.
  const swell = 1 + (final ? 0.05 : 0.08) / scale;
  const rimDegrees = final && buildUp ? (Math.max(0, Math.min(5_000, buildUp.remainingMs)) / 5_000) * 360 : 0;

  return (
    <div
      aria-label={`Phase timer: ${remainingSeconds} seconds remaining`}
      data-muted-timer={muted ? 'true' : 'false'}
      data-timer-progress={progress}
      data-turn-timer={buildUp ? (final ? 'final' : counting ? 'building' : 'steady') : undefined}
      className={cx(
        'relative grid shrink-0 place-items-center',
        buildUp && 'origin-top-right transition-[scale] duration-[350ms] ease-[cubic-bezier(0.33,1,0.68,1)]'
      )}
      style={{ width: COUNTDOWN_SIZE, height: COUNTDOWN_SIZE, ...(buildUp ? { scale } : null) }}
    >
      <div
        // Re-mounted each second of the last ten, which restarts its swell and glow. Reduced motion
        // keeps the colour and the draining rim, without the pulse or the glow.
        key={counting ? remainingSeconds : 'steady'}
        className={cx(
          'relative grid size-full place-items-center rounded-full',
          counting && !final && 'motion-safe:animate-[turnTimerPulse_350ms_linear]',
          final && 'bg-red-01 motion-safe:animate-[turnTimerPulse_350ms_linear,turnTimerGlow_1000ms_linear]'
        )}
        style={counting ? ({ '--turn-timer-swell': swell } as React.CSSProperties) : undefined}
      >
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
            fontFamily: final ? 'var(--font-geist-bold)' : 'var(--font-geist-medium)',
            fontSize: 22,
            fontWeight: final ? 700 : 500,
            lineHeight: 1,
            transform: 'none',
          }}
        >
          {remainingSeconds}
        </span>
      </div>
    </div>
  );
}

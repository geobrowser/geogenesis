'use client';

import * as React from 'react';

const COUNTDOWN_SIZE = 51;
const COUNTDOWN_CENTER = COUNTDOWN_SIZE / 2;
const COUNTDOWN_RADIUS = 21;
const COUNTDOWN_CIRCUMFERENCE = 2 * Math.PI * COUNTDOWN_RADIUS;

type RecordingCountdownVariant = 'default' | 'warning' | 'muted';

export function RecordingCountdownRing({
  remainingSeconds,
  progress,
  variant,
}: {
  remainingSeconds: number;
  progress: number;
  variant: RecordingCountdownVariant;
}) {
  const gradientId = React.useId();
  const elapsedRatio = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  const muted = variant === 'muted';
  const ringColor = muted ? 'rgba(190,190,190,0.92)' : variant === 'warning' ? '#FF4A26' : '#FFFFFF';
  const numberColor = muted ? 'var(--color-grey-02)' : '#FFFFFF';
  const dashOffset = COUNTDOWN_CIRCUMFERENCE * elapsedRatio;

  return (
    <div
      aria-label={`Phase timer: ${remainingSeconds} seconds remaining`}
      data-muted-timer={muted ? 'true' : 'false'}
      data-timer-progress={progress}
      className="relative grid shrink-0 place-items-center"
      style={{ width: COUNTDOWN_SIZE, height: COUNTDOWN_SIZE }}
    >
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
      <span
        className="relative z-10"
        style={{
          color: numberColor,
          fontFamily: 'var(--font-geist-medium)',
          fontSize: 28,
          fontWeight: 500,
          lineHeight: 1,
          transform: 'translateY(-1px)',
        }}
      >
        {remainingSeconds}
      </span>
    </div>
  );
}

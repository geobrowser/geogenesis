'use client';

import * as React from 'react';

import cx from 'classnames';

import { MIC_OVERRUN_MAX_MS } from './local-audio-gate';
import {
  TURN_TIMER_FACE_BACKGROUND,
  TURN_TIMER_FINAL_RIM_MASK,
  turnTimerRimGradient,
  turnTimerRimMask,
} from './recording-countdown-ring';

const BAR_DELAYS_MS = [0, 180, 90, 270];

/**
 * GEO-3407. The corner of a tile whose speaker's time is up but who can still be heard finishing
 * their sentence: the timer's disc, with sound bars in place of the number and a rim that drains
 * over the overrun's ceiling (`MIC_OVERRUN_MAX_MS`). It hands over to the muted microphone when
 * their microphone really closes, rather than at the buzzer.
 *
 * `startedAt` is when the turn ended (`Date.now()`), so a tile that mounts late still drains from
 * the right place.
 */
export function TurnFinishingIndicator({ startedAt, openRounds = false }: { startedAt: number; openRounds?: boolean }) {
  const [initial] = React.useState(() => {
    const remainingMs = Math.max(0, MIC_OVERRUN_MAX_MS - (Date.now() - startedAt));
    return { remainingMs, degrees: (remainingMs / MIC_OVERRUN_MAX_MS) * 360 };
  });
  // Start full (or where it already was), then let the transition drain it on the next frame.
  const [draining, setDraining] = React.useState(false);
  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setDraining(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const rimMask = openRounds ? TURN_TIMER_FINAL_RIM_MASK : turnTimerRimMask('3px');

  return (
    <div
      role="img"
      aria-label="Microphone still open"
      data-turn-finishing="true"
      className="relative grid shrink-0 place-items-center rounded-full"
      style={{
        width: openRounds ? '9cqw' : 51,
        height: openRounds ? '9cqw' : 51,
        backgroundImage: TURN_TIMER_FACE_BACKGROUND,
      }}
    >
      <span
        aria-hidden="true"
        data-turn-finishing-rim
        className="absolute inset-0 rounded-full"
        style={
          {
            '--turn-timer-rim': `${draining ? 0 : initial.degrees}deg`,
            transition: `--turn-timer-rim ${draining ? initial.remainingMs : 0}ms linear`,
            backgroundImage: turnTimerRimGradient(0.28),
            maskImage: rimMask,
            WebkitMaskImage: rimMask,
          } as React.CSSProperties
        }
      />
      <span
        aria-hidden="true"
        className={cx('relative flex items-center', openRounds ? 'h-[3.2cqw] gap-[0.5cqw]' : 'h-[22px] gap-[3px]')}
      >
        {BAR_DELAYS_MS.map(delay => (
          <span
            key={delay}
            className={cx(
              'h-full origin-center scale-y-[0.45] rounded-full bg-white motion-safe:animate-[turnFinishingBar_520ms_ease-in-out_infinite_alternate]',
              openRounds ? 'w-[0.5cqw]' : 'w-[3px]'
            )}
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
    </div>
  );
}

'use client';

import * as React from 'react';

import { CALL_END_TIMER_DELAY_MINUTES, LIVE_MEETING_GRACE_MINUTES } from '~/core/community-calls/constants';

type Props = {
  /** The occurrence's scheduled end time. */
  endTime: Date;
  /** Fired once, when the countdown reaches zero — the caller should disconnect the room. */
  onTimeUp?: () => void;
};

function formatTimeRemaining(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

/**
 * Banner that appears CALL_END_TIMER_DELAY_MINUTES after the occurrence's scheduled
 * end, counts down to the hard cutoff (LIVE_MEETING_GRACE_MINUTES after end), and
 * fires `onTimeUp` exactly once at zero so the caller can force-disconnect this client.
 * No activity-based extension — the cutoff is fixed at mount.
 */
export function CallEndTimer({ endTime, onTimeUp }: Props) {
  const [secondsLeft, setSecondsLeft] = React.useState<number | null>(null);
  const firedRef = React.useRef(false);

  const hardCutoffMs = endTime.getTime() + LIVE_MEETING_GRACE_MINUTES * 60 * 1000;
  const timerVisibleMs = endTime.getTime() + CALL_END_TIMER_DELAY_MINUTES * 60 * 1000;

  React.useEffect(() => {
    const update = () => {
      const now = Date.now();
      if (now < timerVisibleMs) {
        setSecondsLeft(null);
        return;
      }

      const remaining = Math.max(Math.ceil((hardCutoffMs - now) / 1000), 0);
      setSecondsLeft(remaining);

      if (remaining <= 0 && !firedRef.current) {
        firedRef.current = true;
        onTimeUp?.();
      }
    };

    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [hardCutoffMs, timerVisibleMs, onTimeUp]);

  if (secondsLeft === null) return null;

  return (
    <div className="flex h-[30px] w-full items-center justify-center gap-2.5 rounded-lg bg-errorTertiary px-2 py-1">
      <p className="text-metadataMedium text-red-01">
        {secondsLeft > 0 ? `This call will end in ${formatTimeRemaining(secondsLeft)}` : 'This call has ended'}
      </p>
    </div>
  );
}

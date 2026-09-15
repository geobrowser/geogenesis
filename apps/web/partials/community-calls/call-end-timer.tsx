'use client';

import * as React from 'react';

import { CALL_END_TIMER_DELAY_MINUTES, LIVE_MEETING_GRACE_MINUTES } from '~/core/community-calls/constants';
import { CALL_EXTENSION_MS } from '~/core/community-calls/use-call-extension';

type Props = {
  /**
   * The occurrence's scheduled end, plus any extension the room has agreed on. Extending
   * moves the banner and the cutoff together, so a call granted more time goes quiet again
   * until the new deadline approaches.
   */
  endTime: Date;
  /** Fired once, when the countdown reaches zero — the caller should disconnect the room. */
  onTimeUp?: () => void;
  /** Adds {@link CALL_EXTENSION_MS} for everyone. Omitted for anyone who may not extend. */
  onExtend?: () => void;
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
 *
 * Still no *activity-based* extension — a call does not keep itself alive by being busy,
 * because that is how a forgotten room runs forever. An editor can extend it explicitly
 * via `onExtend`, which moves `endTime` for everyone and so re-arms this banner.
 */
export function CallEndTimer({ endTime, onTimeUp, onExtend }: Props) {
  const [secondsLeft, setSecondsLeft] = React.useState<number | null>(null);
  const firedRef = React.useRef(false);

  // Callers pass a fresh closure every render (it has to close over the room), so keeping
  // `onTimeUp` in the effect's deps tore down and rebuilt the interval on every render —
  // which on a busy call is more often than once a second, so the tick could go long
  // stretches without ever firing. Read it through a ref instead.
  const onTimeUpRef = React.useRef(onTimeUp);
  onTimeUpRef.current = onTimeUp;

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
        onTimeUpRef.current?.();
      }
    };

    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [hardCutoffMs, timerVisibleMs]);

  if (secondsLeft === null) return null;

  const extensionMinutes = Math.round(CALL_EXTENSION_MS / 60000);

  return (
    <div className="flex min-h-[30px] w-full items-center justify-center gap-2.5 rounded-lg bg-errorTertiary px-2 py-1">
      <p className="text-metadataMedium text-red-01">
        {secondsLeft > 0 ? `This call will end in ${formatTimeRemaining(secondsLeft)}` : 'This call has ended'}
      </p>
      {onExtend && secondsLeft > 0 ? (
        <button
          type="button"
          onClick={onExtend}
          className="rounded bg-red-01 px-2 py-0.5 text-metadataMedium text-white"
        >
          {`Add ${extensionMinutes} minutes`}
        </button>
      ) : null}
    </div>
  );
}

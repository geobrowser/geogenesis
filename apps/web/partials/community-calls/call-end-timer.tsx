'use client';

import * as React from 'react';

import {
  CALL_END_COUNTDOWN_MS,
  CALL_KEEPALIVE_QUORUM,
  type CallDeadline,
  callDeadline,
} from '~/core/community-calls/call-deadline';
import { CALL_EXTENSION_MS } from '~/core/community-calls/use-call-extension';

type Props = {
  /** The occurrence's scheduled start (epoch ms). */
  startMs: number;
  /** The occurrence's scheduled end (epoch ms), without any extension. */
  endMs: number;
  /**
   * Extension the room has agreed on. Extending moves the banner, the cutoff and the hard
   * cap together, so a call granted more time goes quiet again until the new deadline nears.
   */
  extensionMs: number;
  /** People connected as this client sees them, itself included and agents excluded. */
  connectedCount: number;
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

type Countdown = { secondsLeft: number; reason: CallDeadline['reason'] };

/**
 * Banner that counts down the last {@link CALL_END_COUNTDOWN_MS} before this client's call
 * deadline (see `callDeadline`), and fires `onTimeUp` exactly once at zero so the caller can
 * force-disconnect this client.
 *
 * The deadline is no longer the clock alone (GEO-2584): while {@link CALL_KEEPALIVE_QUORUM}
 * or more people are connected the call runs on to a hard cap, so a meeting that overruns is
 * not cut off mid-conversation. Below quorum it ends at the scheduled cutoff, or shortly
 * after the room empties if that happens later.
 *
 * "When did the room fall below quorum" is tracked here, inside the tick, rather than by the
 * caller: it needs the current time, and taking it in render would be impure, while taking it
 * in the caller's effect would leave this child's first tick reading a stale deadline — and
 * past the scheduled cutoff a stale deadline is one in the past, which ends the call.
 */
export function CallEndTimer({ startMs, endMs, extensionMs, connectedCount, onTimeUp, onExtend }: Props) {
  const [countdown, setCountdown] = React.useState<Countdown | null>(null);
  const firedRef = React.useRef(false);
  const belowQuorumSinceRef = React.useRef<number | null>(null);

  // Callers pass a fresh closure every render (it has to close over the room), so keeping
  // `onTimeUp` in the effect's deps tore down and rebuilt the interval on every render —
  // which on a busy call is more often than once a second, so the tick could go long
  // stretches without ever firing. Read it through a ref instead.
  const onTimeUpRef = React.useRef(onTimeUp);
  onTimeUpRef.current = onTimeUp;

  React.useEffect(() => {
    const update = () => {
      const now = Date.now();

      if (connectedCount >= CALL_KEEPALIVE_QUORUM) belowQuorumSinceRef.current = null;
      else belowQuorumSinceRef.current ??= now;

      const { deadlineMs, reason } = callDeadline({
        startMs,
        endMs,
        extensionMs,
        connectedCount,
        belowQuorumSinceMs: belowQuorumSinceRef.current,
      });

      if (now < deadlineMs - CALL_END_COUNTDOWN_MS) {
        setCountdown(null);
        return;
      }

      const secondsLeft = Math.max(Math.ceil((deadlineMs - now) / 1000), 0);
      setCountdown({ secondsLeft, reason });

      if (secondsLeft <= 0 && !firedRef.current) {
        firedRef.current = true;
        onTimeUpRef.current?.();
      }
    };

    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [startMs, endMs, extensionMs, connectedCount]);

  if (countdown === null) return null;
  const { secondsLeft, reason } = countdown;

  const extensionMinutes = Math.round(CALL_EXTENSION_MS / 60000);
  const message =
    secondsLeft <= 0
      ? 'This call has ended'
      : reason === 'alone'
        ? `Everyone else has left. This call will end in ${formatTimeRemaining(secondsLeft)}`
        : `This call will end in ${formatTimeRemaining(secondsLeft)}`;

  return (
    <div className="flex min-h-[30px] w-full items-center justify-center gap-2.5 rounded-lg bg-errorTertiary px-2 py-1">
      <p className="text-metadataMedium text-red-01">{message}</p>
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

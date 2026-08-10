'use client';

import * as React from 'react';

import { getServerTime } from '../api';
import { type ServerClock, createLocalServerClock, synchronizeServerClock } from '../server-clock';

const MINUTE_MS = 60_000;
const MINUTE_TICK_MS = 15_000;
const SECOND_TICK_MS = 1_000;

let clockPromise: Promise<ServerClock> | null = null;

/**
 * Request expiry is a server timestamp, so a client whose clock is skewed would show the wrong
 * countdown. One synchronization per session is shared by every countdown on the page.
 */
function getServerClock() {
  if (!clockPromise) {
    clockPromise = synchronizeServerClock(getServerTime).catch(() => createLocalServerClock());
  }
  return clockPromise;
}

export function useServerClock() {
  const [clock, setClock] = React.useState<ServerClock | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void getServerClock().then(resolved => {
      if (!cancelled) setClock(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return clock;
}

export type RequestCountdown = {
  label: string;
  remainingMs: number;
  expired: boolean;
};

/**
 * Ticks once every 15s while more than a minute remains, then every second. `expired` lets a card
 * disappear immediately instead of waiting for the server's `debate.requests_changed` event.
 */
export function useRequestCountdown(expiresAt: string): RequestCountdown {
  const clock = useServerClock();
  const expiresAtMs = React.useMemo(() => new Date(expiresAt).getTime(), [expiresAt]);
  const [now, setNow] = React.useState(() => Date.now());

  const remainingMs = Math.max(0, expiresAtMs - now);
  // The tick rate only changes when we cross the final minute, so the effect re-arms then — and
  // once more at expiry, where it clears the interval for good.
  const isFinalMinute = remainingMs <= MINUTE_MS;
  const expired = Number.isFinite(expiresAtMs) && remainingMs <= 0;

  React.useEffect(() => {
    const read = () => (clock ? clock.now() : Date.now());
    setNow(read());

    if (expired || !Number.isFinite(expiresAtMs) || expiresAtMs - read() <= 0) return;

    const interval = setInterval(() => setNow(read()), isFinalMinute ? SECOND_TICK_MS : MINUTE_TICK_MS);
    return () => clearInterval(interval);
  }, [clock, expired, expiresAtMs, isFinalMinute]);

  return {
    label: formatCountdown(remainingMs),
    remainingMs,
    expired,
  };
}

/**
 * Filters out requests whose `expires_at` has passed, re-evaluating exactly when the next one
 * expires. Every surface that shows requests (list, empty state, badges, the coordinator's popup)
 * must derive from this same filter so none of them disagree about a dead request while waiting
 * for the server's `debate.requests_changed` event.
 */
export function useUnexpiredRequests<T extends { expires_at: string }>(requests: T[]): T[] {
  const clock = useServerClock();
  const [now, setNow] = React.useState(() => Date.now());

  const nextExpiryMs = React.useMemo(() => {
    let next = Infinity;
    for (const request of requests) {
      const expires = new Date(request.expires_at).getTime();
      if (Number.isFinite(expires) && expires > now && expires < next) next = expires;
    }
    return next;
  }, [now, requests]);

  React.useEffect(() => {
    const read = () => (clock ? clock.now() : Date.now());
    setNow(read());
    if (!Number.isFinite(nextExpiryMs)) return;

    const timeout = setTimeout(() => setNow(read()), Math.max(0, nextExpiryMs - read()) + 1);
    return () => clearTimeout(timeout);
  }, [clock, nextExpiryMs]);

  return React.useMemo(
    () =>
      requests.filter(request => {
        const expires = new Date(request.expires_at).getTime();
        // Unparseable expiries stay visible — matching the card, which only hides a finite past.
        return !Number.isFinite(expires) || expires > now;
      }),
    [now, requests]
  );
}

export function formatCountdown(remainingMs: number) {
  if (remainingMs <= 0) return 'Expired';
  if (remainingMs < MINUTE_MS) return `Expires in ${Math.ceil(remainingMs / 1_000)}s`;
  return `Expires in ${Math.ceil(remainingMs / MINUTE_MS)}m`;
}

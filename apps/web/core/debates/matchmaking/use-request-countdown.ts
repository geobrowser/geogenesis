'use client';

import * as React from 'react';

import { getServerTime } from '../api';
import { type ServerClock, createLocalServerClock, synchronizeServerClock } from '../server-clock';

const MINUTE_MS = 60_000;
const MINUTE_TICK_MS = 15_000;
const SECOND_TICK_MS = 1_000;
/** `setTimeout` overflows past this and fires immediately instead, which reads as an expiry. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

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

/**
 * `enabled` exists because synchronizing costs three parallel round trips — it samples and keeps
 * the fastest — and both the navbar button and `DebateCoordinator` mount on every page. Left
 * ungated they bought that sync for every session, including the overwhelming majority with no
 * request to time. Callers with nothing on the clock pass `false` and fall through to `Date.now()`,
 * which cannot be wrong about a countdown that isn't running.
 */
export function useServerClock(enabled = true) {
  const [clock, setClock] = React.useState<ServerClock | null>(null);

  React.useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void getServerClock().then(resolved => {
      if (!cancelled) setClock(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return clock;
}

/**
 * The server's `now`, re-read every `tickMs`, falling back to the browser's until the clock syncs:
 * for comparing against a time geo-chat set, so a skewed laptop does not misreport it. The join
 * prompt's "Scheduled in 3 mins" and the room's Nudge (GEO-3428) both read it.
 */
export function useServerNow(tickMs = MINUTE_TICK_MS) {
  const clock = useServerClock();
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const read = () => (clock ? clock.now() : Date.now());
    setNow(read());
    const interval = setInterval(() => setNow(read()), tickMs);
    return () => clearInterval(interval);
  }, [clock, tickMs]);

  return now;
}

export type RequestCountdown = {
  label: string;
  remainingMs: number;
  expired: boolean;
};

export type CountdownFormat = 'words' | 'clock';

/**
 * Ticks once every 15s while more than a minute remains, then every second. `expired` lets a card
 * disappear immediately instead of waiting for the server's `debate.requests_changed` event.
 *
 * `format: 'clock'` is the `m:ss` the side panel times a live ask in ("Requesting · 1:12",
 * GEO-3463). A clock shows its seconds, so it ticks every second throughout rather than in
 * quarter-minutes while more than a minute is left. Both stop at expiry. `null` is "nothing to
 * time": no clock sync, no interval.
 */
export function useRequestCountdown(
  expiresAt: string | null,
  { format = 'words' }: { format?: CountdownFormat } = {}
): RequestCountdown {
  const clock = useServerClock(expiresAt !== null);
  const expiresAtMs = React.useMemo(() => (expiresAt ? new Date(expiresAt).getTime() : NaN), [expiresAt]);
  const [now, setNow] = React.useState(() => Date.now());

  // An unparseable time stays NaN, which `formatCountdown` reads as "Expires later", as before.
  const remainingMs = expiresAt === null ? 0 : Math.max(0, expiresAtMs - now);
  // The tick rate only changes when we cross the final minute, so the effect re-arms then — and
  // once more at expiry, where it clears the interval for good.
  const everySecond = format === 'clock' || remainingMs <= MINUTE_MS;
  const expired = Number.isFinite(expiresAtMs) && remainingMs <= 0;

  React.useEffect(() => {
    if (!Number.isFinite(expiresAtMs)) return;
    const read = () => (clock ? clock.now() : Date.now());
    setNow(read());

    if (expired || expiresAtMs - read() <= 0) return;

    const interval = setInterval(() => setNow(read()), everySecond ? SECOND_TICK_MS : MINUTE_TICK_MS);
    return () => clearInterval(interval);
  }, [clock, expired, expiresAtMs, everySecond]);

  return {
    label: format === 'clock' ? formatCountdownClock(remainingMs) : formatCountdown(remainingMs),
    remainingMs,
    expired,
  };
}

/**
 * One request that is still pending and unexpired, or `null`: the single-request form of
 * {@link useUnexpiredRequests}, for the outbound request and the claimless challenge.
 */
export function useLiveRequest<T extends { expires_at: string; status: string }>(request: T | null | undefined) {
  const pending = request?.status === 'pending' ? request : null;
  const live = useUnexpiredRequests(React.useMemo(() => (pending ? [pending] : []), [pending]));
  return live[0] ?? null;
}

/**
 * Filters out requests whose `expires_at` has passed, re-evaluating exactly when the next one
 * expires. Every surface that shows requests (list, empty state, badges, the coordinator's popup)
 * must derive from this same filter so none of them disagree about a dead request while waiting
 * for the server's `debate.requests_changed` event.
 */
export function useUnexpiredRequests<T extends { expires_at: string }>(requests: T[]): T[] {
  // An empty list is the common case on the surfaces that mount globally, and it has no expiry to
  // get wrong — so it doesn't pay for the clock. The sync starts when the first request lands.
  const clock = useServerClock(requests.length > 0);
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

    const timeout = setTimeout(() => setNow(read()), Math.min(MAX_TIMEOUT_MS, Math.max(0, nextExpiryMs - read()) + 1));
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
  // An unparseable `expires_at` reaches here as NaN, which fails both comparisons below and used to
  // render "Expires in NaNm". Such a request stays visible, so it needs a label that isn't a lie.
  if (!Number.isFinite(remainingMs)) return 'Expires later';
  if (remainingMs <= 0) return 'Expired';
  if (remainingMs < MINUTE_MS) return `Expires in ${Math.ceil(remainingMs / 1_000)}s`;
  return `Expires in ${Math.ceil(remainingMs / MINUTE_MS)}m`;
}

/** `m:ss`, rounded up so an open request never reads 0:00 while it is still live. */
export function formatCountdownClock(remainingMs: number) {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return '0:00';
  const totalSeconds = Math.ceil(remainingMs / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

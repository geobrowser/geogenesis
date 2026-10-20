'use client';

import * as React from 'react';

import { browserTimezone } from '~/core/debates/browser-timezone';
import { usePrivy } from '~/core/wallet/auth-hooks';
import { storedPrivyAccessToken } from '~/core/wallet/privy-session';

import { geoNotificationsApiUrl, sendSeenPing } from './api';

/** How long to wait for Privy to hand out a fresh token before giving up on this ping. */
const FRESH_TOKEN_TIMEOUT_MS = 5_000;

/** Today in the browser's own zone, YYYY-MM-DD. */
export function browserLocalDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>(resolve => setTimeout(() => resolve(null), ms))]);
}

/**
 * Tells geo-notifications this signed-in person visited, and their browser's zone (GEO-3371): on
 * every full page load, and when the tab comes back into focus on a new local day, so someone who
 * keeps one tab open all week still counts as visiting each day they use it. The retention emails
 * are scheduled from it (no program email on a day you visited, What you missed after a week away,
 * the stop after 30 days).
 *
 * Sends the token Privy stored in the browser straight away, without waiting for Privy to load, and
 * the service accepts it up to a week past expiry, so a visit counts while Privy is slow or down.
 * Only if that is refused does it ask Privy for a fresh one. Mounted once, app-wide; failures are
 * swallowed and retried on the next focus.
 */
export function SeenPing() {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const getAccessTokenRef = React.useRef(getAccessToken);
  getAccessTokenRef.current = getAccessToken;
  const lastPingedDate = React.useRef<string | null>(null);
  const inFlight = React.useRef(false);

  const ping = React.useCallback(async () => {
    const baseUrl = geoNotificationsApiUrl();
    const timeZone = browserTimezone();
    const today = browserLocalDate();
    if (!baseUrl || !timeZone || inFlight.current || lastPingedDate.current === today) return;
    inFlight.current = true;
    try {
      let status: number | null = null;
      const stored = storedPrivyAccessToken();
      if (stored) status = await sendSeenPing(baseUrl, stored, timeZone);
      if (status !== null && status >= 200 && status < 300) {
        lastPingedDate.current = today;
        return;
      }
      // No stored token, or one too old: a fresh one, if Privy can give it in time.
      const fresh = await withTimeout(getAccessTokenRef.current(), FRESH_TOKEN_TIMEOUT_MS).catch(() => null);
      if (!fresh || fresh === stored) return;
      status = await sendSeenPing(baseUrl, fresh, timeZone);
      if (status >= 200 && status < 300) lastPingedDate.current = today;
    } catch {
      // Offline or the service is down: the next focus tries again.
    } finally {
      inFlight.current = false;
    }
  }, []);

  // The page load, and signing in on this page. Signed out with no stored token, there is nobody to count.
  React.useEffect(() => {
    if (storedPrivyAccessToken() || (ready && authenticated)) void ping();
  }, [ready, authenticated, ping]);

  // Back to the tab on a new local day.
  React.useEffect(() => {
    const onReturn = () => {
      if (document.visibilityState !== 'visible') return;
      if (lastPingedDate.current === browserLocalDate()) return;
      if (storedPrivyAccessToken() || authenticated) void ping();
    };
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);
    return () => {
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onReturn);
    };
  }, [authenticated, ping]);

  return null;
}

'use client';

import * as React from 'react';

import { browserTimezone } from '~/core/debates/browser-timezone';
import { zonedDay } from '~/core/debates/debate-hours';
import { resolveWithin } from '~/core/utils/resolve-within';
import { usePrivy } from '~/core/wallet/auth-hooks';
import { storedPrivyAccessToken } from '~/core/wallet/privy-session';

import { NotificationsRequestError, geoNotificationsApiUrl, sendSeenPing } from './api';

/** How long to wait for Privy to hand out a fresh token before giving up on this ping. */
const FRESH_TOKEN_TIMEOUT_MS = 5_000;
/**
 * How long one ping may take, response included. A request that hangs past it is aborted and
 * counts as failed, so it can't hold the in-flight guard and block the next focus from retrying.
 */
export const SEEN_REQUEST_TIMEOUT_MS = 10_000;

const TIMED_OUT = Symbol('timed out');

/** One ping under the deadline; throws on timeout like any other failure. */
async function pingWithin(baseUrl: string, token: string, timeZone: string): Promise<void> {
  const result = await resolveWithin<unknown>(
    signal => sendSeenPing(baseUrl, token, timeZone, signal),
    SEEN_REQUEST_TIMEOUT_MS,
    TIMED_OUT
  );
  if (result === TIMED_OUT) throw new Error('seen ping timed out');
}

/**
 * Tells geo-notifications this signed-in person visited, and their browser's zone (GEO-3371): on
 * every full page load, and when the tab comes back into focus on a new local or UTC day, so someone who
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
  const lastPingedDay = React.useRef<string | null>(null);
  const inFlight = React.useRef(false);

  const ping = React.useCallback(async () => {
    const baseUrl = geoNotificationsApiUrl();
    const timeZone = browserTimezone();
    if (!baseUrl || !timeZone) return;
    // Once per local day *and* per UTC day: the scheduler decides by local day, but geo-notifications
    // counts visitors per UTC day (to compare with the warehouse), and a local day spans two of them.
    const now = new Date();
    const today = `${zonedDay(now, timeZone)}|${zonedDay(now, 'UTC')}`;
    if (inFlight.current || lastPingedDay.current === today) return;
    inFlight.current = true;
    try {
      const stored = storedPrivyAccessToken();
      if (stored) {
        try {
          await pingWithin(baseUrl, stored, timeZone);
          lastPingedDay.current = today;
          return;
        } catch (error) {
          // Only a refused token is worth a fresh one; anything else waits for the next focus.
          if (!(error instanceof NotificationsRequestError && error.status === 401)) return;
        }
      }
      const fresh = await resolveWithin(() => getAccessTokenRef.current(), FRESH_TOKEN_TIMEOUT_MS, null).catch(
        () => null
      );
      if (!fresh || fresh === stored) return;
      await pingWithin(baseUrl, fresh, timeZone);
      lastPingedDay.current = today;
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

  // Back to the tab: `ping` itself sends nothing on a day it already counted.
  React.useEffect(() => {
    const onReturn = () => {
      if (document.visibilityState !== 'visible') return;
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

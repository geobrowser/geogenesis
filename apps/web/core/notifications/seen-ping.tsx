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

/** After a failed ping, how long before a return to the tab may try again. */
export const SEEN_RETRY_GAP_MS = 60_000;

/**
 * Tells geo-notifications this signed-in person visited, and their browser's zone (GEO-3371): on
 * every full page load, and when the tab comes back into focus on a new local or UTC day, so someone
 * who keeps one tab open all week still counts as visiting each day they use it. The retention
 * emails are scheduled from it (no program email on a day you visited, What you missed after a week
 * away, the stop after 30 days).
 *
 * Who counts: before Privy is ready, anyone with a token Privy stored in the browser, sent straight
 * away (the service accepts it up to a week past expiry), so a visit counts while Privy is slow or
 * down. Once Privy is ready, only someone it reports signed in: a token left behind after a sign-out
 * doesn't count.
 *
 * Privy is never loaded for this. Only when the stored token is refused *and* Privy already reports
 * them signed in does it ask for a fresh one; otherwise a refused token is done with for the page
 * load. Mounted once, app-wide. A failure waits at least a minute before a return retries it, and a
 * 404 (the route isn't there) stops it for the page load.
 */
export function SeenPing() {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const privy = React.useRef({ ready, authenticated, getAccessToken });
  privy.current = { ready, authenticated, getAccessToken };
  const lastPingedDay = React.useRef<string | null>(null);
  const inFlight = React.useRef(false);
  /** A stored token the service refused; not sent again. */
  const refusedToken = React.useRef<string | null>(null);
  const retryAfter = React.useRef(0);
  const stopped = React.useRef(false);

  const ping = React.useCallback(async () => {
    const baseUrl = geoNotificationsApiUrl();
    const timeZone = browserTimezone();
    if (!baseUrl || !timeZone || stopped.current || Date.now() < retryAfter.current) return;
    const { ready, authenticated } = privy.current;
    const signedIn = ready && authenticated;
    const stored = storedPrivyAccessToken();
    const usableStored = stored && stored !== refusedToken.current && (!ready || authenticated) ? stored : null;
    if (!usableStored && !signedIn) return;
    // Once per local day *and* per UTC day: the scheduler decides by local day, but geo-notifications
    // counts visitors per UTC day (to compare with the warehouse), and a local day spans two of them.
    const now = new Date();
    const today = `${zonedDay(now, timeZone)}|${zonedDay(now, 'UTC')}`;
    if (inFlight.current || lastPingedDay.current === today) return;
    inFlight.current = true;
    try {
      if (usableStored) {
        try {
          await pingWithin(baseUrl, usableStored, timeZone);
          lastPingedDay.current = today;
          return;
        } catch (error) {
          if (!(error instanceof NotificationsRequestError && error.status === 401)) throw error;
          refusedToken.current = usableStored;
        }
      }
      // A fresh token only for someone Privy already has signed in: asking otherwise would load Privy.
      if (!(privy.current.ready && privy.current.authenticated)) return;
      const fresh = await resolveWithin(() => privy.current.getAccessToken(), FRESH_TOKEN_TIMEOUT_MS, null).catch(
        () => null
      );
      if (!fresh || fresh === stored) return;
      await pingWithin(baseUrl, fresh, timeZone);
      lastPingedDay.current = today;
    } catch (error) {
      // Offline, the service is down, or the route is missing.
      if (error instanceof NotificationsRequestError && error.status === 404) stopped.current = true;
      retryAfter.current = Date.now() + SEEN_RETRY_GAP_MS;
    } finally {
      inFlight.current = false;
    }
  }, []);

  // The page load, signing in on this page, and Privy becoming ready. A sign-out forgets the day,
  // so the next account to sign in on this page counts too.
  const wasSignedIn = React.useRef(false);
  React.useEffect(() => {
    const signedIn = ready && authenticated;
    if (wasSignedIn.current && !signedIn) {
      lastPingedDay.current = null;
      refusedToken.current = null;
    }
    wasSignedIn.current = signedIn;
    void ping();
  }, [ready, authenticated, ping]);

  // Back to the tab: `ping` decides whether there is anything to send.
  React.useEffect(() => {
    const onReturn = () => {
      if (document.visibilityState === 'visible') void ping();
    };
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);
    return () => {
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onReturn);
    };
  }, [ping]);

  return null;
}

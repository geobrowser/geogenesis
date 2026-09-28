'use client';

import * as React from 'react';

import { type GetPrivyIdentityToken, reportDebateInteraction } from './api';

/**
 * Report at most this often. The server treats input inside a two-minute window as "active", so
 * four reports per window is ample headroom for a dropped one, and it keeps a debate-long session
 * to a couple of requests a minute.
 */
export const INTERACTION_REPORT_INTERVAL_MS = 30_000;

/**
 * What counts as a human. Pointer, keyboard, scroll and touch — the things a person does and a
 * left-open tab does not. Deliberately not `visibilitychange` or `focus`: an abandoned tab can be
 * brought to the front by an OS window shuffle, and a tab being visible is already the loose
 * signal we are trying to distinguish ourselves from.
 */
const INTERACTION_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

/**
 * Tells geo-chat that a person, rather than a tab, is here.
 *
 * `last_seen_at` is refreshed by a timer and so is true of an abandoned tab forever; matchmaking
 * ranked on it alone fills with ghosts. This is the other half: it fires only on real input, and
 * geo-chat ranks by it without gating on it.
 *
 * Leading edge as well as trailing: someone coming back after a break is marked active on their
 * first click rather than up to thirty seconds later, which is exactly when the ranking matters.
 *
 * Every failure is swallowed. A missed report costs a slightly stale ranking; surfacing it would
 * cost a spurious error on a page that is working perfectly.
 */
export function useDebateInteractionReporter(
  enabled: boolean,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  const lastReportedAtRef = React.useRef<number | null>(null);
  const pendingTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const authRef = React.useRef({ getPrivyIdentityToken, accountKey });
  authRef.current = { getPrivyIdentityToken, accountKey };

  React.useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    let cancelled = false;

    const send = () => {
      lastReportedAtRef.current = Date.now();
      void reportDebateInteraction(authRef.current.getPrivyIdentityToken, authRef.current.accountKey).catch(
        () => undefined
      );
    };

    const onInteraction = () => {
      if (cancelled || pendingTimerRef.current) return;
      const lastReportedAt = lastReportedAtRef.current;
      const elapsed = lastReportedAt === null ? Infinity : Date.now() - lastReportedAt;
      if (elapsed >= INTERACTION_REPORT_INTERVAL_MS) {
        send();
        return;
      }
      // Inside the throttle: remember that input happened and report when it lapses, so a long
      // stretch of continuous activity keeps reporting instead of falling silent after the first.
      pendingTimerRef.current = setTimeout(() => {
        pendingTimerRef.current = null;
        if (!cancelled) send();
      }, INTERACTION_REPORT_INTERVAL_MS - elapsed);
    };

    for (const eventName of INTERACTION_EVENTS) {
      window.addEventListener(eventName, onInteraction, { passive: true, capture: true });
    }
    return () => {
      cancelled = true;
      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
      for (const eventName of INTERACTION_EVENTS) {
        window.removeEventListener(eventName, onInteraction, { capture: true });
      }
    };
  }, [enabled]);
}

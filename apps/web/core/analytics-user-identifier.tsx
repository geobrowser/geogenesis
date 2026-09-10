'use client';

import { usePrivy } from '@geogenesis/auth';

import * as React from 'react';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';

import {
  bindPrivyAnalytics,
  identifyPrivyUser,
  reconcileAnonymousAnalyticsIdentity,
  restorePrivySession,
} from './analytics';

export function AnalyticsUserIdentifier() {
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const { personalSpaceId, isFetched } = usePersonalSpaceId();
  const lastIdentityKey = React.useRef<string | null>(null);
  const restoredUserId = React.useRef<string | null>(null);
  const sawReadyUnauthenticated = React.useRef(false);

  React.useEffect(() => {
    if (!ready || !authenticated || !user) {
      lastIdentityKey.current = null;
      return;
    }

    const identityKey = `${user.id}:${personalSpaceId ?? ''}`;

    if (lastIdentityKey.current === identityKey) {
      return;
    }

    lastIdentityKey.current = identityKey;

    identifyPrivyUser(user, {
      personal_space_id: personalSpaceId ?? undefined,
      personal_space_registered: isFetched ? Boolean(personalSpaceId) : undefined,
    });
  }, [ready, authenticated, user, personalSpaceId, isFetched]);

  React.useEffect(() => {
    if (!ready) {
      return;
    }

    if (!authenticated) {
      reconcileAnonymousAnalyticsIdentity();
      sawReadyUnauthenticated.current = true;
      restoredUserId.current = null;
      return;
    }

    if (!user) {
      return;
    }

    if (sawReadyUnauthenticated.current || !user.id || restoredUserId.current === user.id) {
      return;
    }

    restoredUserId.current = user.id;
    restorePrivySession(user);
  }, [ready, authenticated, user]);

  React.useEffect(() => {
    if (!ready || !authenticated || !user?.id || process.env.NEXT_PUBLIC_GEO_ANALYTICS_VERIFIED_IDENTITY !== 'true')
      return;
    let current = true;
    let bound = false;
    let inFlight = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const delays = [1000, 4000, 16000];

    async function attempt() {
      if (!current || bound || inFlight || !navigator.onLine || document.hidden) return;
      inFlight = true;
      try {
        // Each attempt obtains a fresh token; no token is retained by the timer.
        bound = await bindPrivyAnalytics(getAccessToken, () => current);
      } catch {
        bound = false;
      } finally {
        inFlight = false;
      }
      if (current && !bound && retry < delays.length) {
        timer = setTimeout(() => {
          void attempt();
        }, delays[retry++]);
      }
    }
    function resume() {
      if (!current || bound || inFlight || document.hidden || !navigator.onLine) return;
      clearTimeout(timer);
      retry = 0;
      void attempt();
    }
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume);
    void attempt();
    return () => {
      current = false;
      clearTimeout(timer);
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [ready, authenticated, user?.id, getAccessToken]);

  return null;
}

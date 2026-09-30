'use client';

import { useLogout, usePrivy, usePrivyLogin } from '@geogenesis/auth';

import { useEffect, useRef } from 'react';

import { openAuthAttempt } from './auth-attempt';
import { cancelPrivyAuth, completePrivyAuth, resetPrivyAuthSession } from './privy-auth-events';

function isOAuthCallback() {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return ['privy_oauth_code', 'privy_oauth_state', 'privy_oauth_provider'].every(key => Boolean(params.get(key)));
}

/** Owns login and restore events for the app lifetime, independent of login controls. */
export function PrivyAuthTracker() {
  // Privy removes callback parameters while completing OAuth. Remember only the
  // boolean so its status modal cannot replace the originating document's attempt.
  const oauthCallback = useRef(isOAuthCallback());
  usePrivyLogin({
    onComplete: args => {
      completePrivyAuth(args);
      oauthCallback.current = false;
    },
    onError: error => {
      // Invalid codes and transient failures leave the modal open for a retry. Keep the
      // initiating attribution until dismissal; the next login press also replaces it.
      if (error === 'exited_auth_flow') {
        cancelPrivyAuth();
        oauthCallback.current = false;
      }
    },
  });
  useLogout({ onSuccess: resetPrivyAuthSession });
  const { ready, authenticated, isModalOpen } = usePrivy();
  useEffect(() => {
    if (!isModalOpen || authenticated || oauthCallback.current) return;
    openAuthAttempt();
  }, [isModalOpen, authenticated]);
  const wasAuthenticated = useRef(false);
  useEffect(() => {
    if (!ready) return;
    // Expiry and logout in another tab need not fire this tab's useLogout callback.
    if (wasAuthenticated.current && !authenticated) resetPrivyAuthSession();
    wasAuthenticated.current = authenticated;
  }, [ready, authenticated]);
  return null;
}

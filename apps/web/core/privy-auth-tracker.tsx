'use client';

import { useLogout, usePrivy, usePrivyLogin } from '@geogenesis/auth';

import { useEffect, useRef } from 'react';

import { openAuthAttempt } from './auth-attempt';
import { useOnSignOut } from './hooks/use-on-sign-out';
import { type ExitedFlowAccount, cancelPrivyAuth, completePrivyAuth, resetPrivyAuthSession } from './privy-auth-events';

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
  const { authenticated, isModalOpen, user } = usePrivy();
  // Read when the flow is exited, which can come after Privy has already signed someone in.
  const signedIn = useRef<ExitedFlowAccount>(null);
  signedIn.current = authenticated && user ? user : null;
  usePrivyLogin({
    onComplete: args => {
      completePrivyAuth(args);
      oauthCallback.current = false;
    },
    onError: error => {
      // Invalid codes and transient failures leave the modal open for a retry. Keep the
      // initiating attribution until dismissal; the next login press also replaces it.
      if (error === 'exited_auth_flow') {
        cancelPrivyAuth(signedIn.current);
        oauthCallback.current = false;
      }
    },
  });
  useLogout({ onSuccess: resetPrivyAuthSession });
  useEffect(() => {
    if (!isModalOpen || authenticated || oauthCallback.current) return;
    openAuthAttempt();
  }, [isModalOpen, authenticated]);
  // Expiry and logout in another tab need not fire this tab's useLogout callback.
  useOnSignOut(resetPrivyAuthSession);
  return null;
}

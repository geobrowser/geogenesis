'use client';

import { useLogout, usePrivy, usePrivyLogin } from '@geogenesis/auth';

import { useEffect, useRef } from 'react';

import { cancelPrivyAuth, completePrivyAuth, resetPrivyAuthSession } from './privy-auth-events';

/** Owns login and restore events for the app lifetime, independent of login controls. */
export function PrivyAuthTracker() {
  usePrivyLogin({
    onComplete: completePrivyAuth,
    onError: error => {
      // Invalid codes and transient failures leave the modal open for a retry. Keep the
      // initiating attribution until dismissal; the next login press also replaces it.
      if (error === 'exited_auth_flow') cancelPrivyAuth();
    },
  });
  useLogout({ onSuccess: resetPrivyAuthSession });
  const { ready, authenticated } = usePrivy();
  const wasAuthenticated = useRef(false);
  useEffect(() => {
    if (!ready) return;
    // Expiry and logout in another tab need not fire this tab's useLogout callback.
    if (wasAuthenticated.current && !authenticated) resetPrivyAuthSession();
    wasAuthenticated.current = authenticated;
  }, [ready, authenticated]);
  return null;
}

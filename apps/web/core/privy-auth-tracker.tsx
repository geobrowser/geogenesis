'use client';

import { useLogout, usePrivy, usePrivyLogin } from '@geogenesis/auth';

import { useEffect, useRef } from 'react';

import { cancelPrivyAuth, completePrivyAuth, resetPrivyAuthSession } from './privy-auth-events';

/** One observer for the app lifetime, independent of the control that opened Privy. */
export function PrivyAuthTracker() {
  usePrivyLogin({ onComplete: completePrivyAuth, onError: cancelPrivyAuth });
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

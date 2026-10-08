'use client';

import { usePrivy } from '@geogenesis/auth';

import { useEffect, useRef } from 'react';

/**
 * Runs `onSignOut` when this tab goes from signed in to signed out: a logout here, a logout in
 * another tab, or a session that expired. Privy's `useLogout` callback only covers the first, so
 * anything that must forget the account on the other two watches `authenticated` instead.
 *
 * Waits for `ready`, because Privy reports `authenticated: false` while it is still restoring a
 * session, and that is not a sign-out.
 */
export function useOnSignOut(onSignOut: () => void) {
  const { ready, authenticated } = usePrivy();
  const onSignOutRef = useRef(onSignOut);
  onSignOutRef.current = onSignOut;
  const wasAuthenticated = useRef(false);

  useEffect(() => {
    if (!ready) return;
    if (wasAuthenticated.current && !authenticated) onSignOutRef.current();
    wasAuthenticated.current = authenticated;
  }, [ready, authenticated]);
}

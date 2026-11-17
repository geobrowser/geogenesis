'use client';

import * as React from 'react';

import { useRouter } from 'next/navigation';

import { getCachedIdentityToken, useIdentityTokenSync } from '~/core/auth/identity-token';
import { usePrivy } from '~/core/wallet/auth-hooks';

import {
  clearWalletSession,
  forgetWalletSession,
  hasWalletSessionHint,
  syncWalletSession,
} from './wallet-session-client';

/**
 * Keeps the server's wallet session in step with Privy: each new identity token is posted (which
 * also renews the session), and a Privy sign-out clears it. Independent of the smart account, so a
 * ZeroDev or RPC failure cannot leave a signed-in user signed out on the server.
 */
export function WalletSessionSync() {
  const router = useRouter();
  const { ready, authenticated } = usePrivy();
  const identityToken = useIdentityTokenSync();

  React.useEffect(() => {
    if (!ready) return;
    const refresh = () => router.refresh();

    if (!authenticated) {
      forgetWalletSession();
      if (hasWalletSessionHint()) clearWalletSession().catch(() => {});
      return;
    }

    if (identityToken) {
      void syncWalletSession(identityToken, refresh);
      return;
    }
    // Signed in but Privy has not published a token yet: ask for one.
    let cancelled = false;
    getCachedIdentityToken().then(token => {
      if (token && !cancelled) void syncWalletSession(token, refresh);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, authenticated, identityToken, router]);

  return null;
}

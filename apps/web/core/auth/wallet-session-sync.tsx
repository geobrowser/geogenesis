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
 * Keeps the server's wallet session in step with Privy: posts each new identity token and clears
 * the session on Privy sign-out. Independent of the smart account, so ZeroDev failures can't affect it.
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

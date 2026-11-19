'use client';

import * as React from 'react';

import { useRouter } from 'next/navigation';

import { getCachedIdentityToken, useIdentityTokenSync } from '~/core/auth/identity-token';
import { usePrivy } from '~/core/wallet/auth-hooks';
import { accountHasEmbeddedWallet } from '~/core/wallet/embedded-wallet';

import {
  NOT_SYNCED,
  clearWalletSession,
  forgetWalletSession,
  hasWalletSessionHint,
  noteEmbeddedWallet,
  subscribeWalletSessionSync,
  syncWalletSession,
  walletSessionSyncState,
} from './wallet-session-client';

/**
 * Whether the server's wallet session holds `address` (`synced`), or syncing has given up
 * (`settled` either way). Writes gate on `settled`; anything keyed on what the server reads, on `synced`.
 */
export function useWalletSessionSync(address: string | null | undefined) {
  const state = React.useSyncExternalStore(subscribeWalletSessionSync, walletSessionSyncState, () => NOT_SYNCED);
  const synced = Boolean(address) && state.wallet === address!.toLowerCase();
  return { synced, settled: synced || state.gaveUp };
}

/**
 * Keeps the server's wallet session in step with Privy: posts each new identity token and clears
 * the session on Privy sign-out. Independent of the smart account, so ZeroDev failures can't affect it.
 */
export function WalletSessionSync() {
  const router = useRouter();
  const { ready, authenticated, user } = usePrivy();
  const identityToken = useIdentityTokenSync();
  // The server reads the wallet from the token's linked accounts, so watch the same list.
  const hasWallet = accountHasEmbeddedWallet(user);

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

  React.useEffect(() => {
    if (ready && authenticated && hasWallet) noteEmbeddedWallet(() => router.refresh());
  }, [ready, authenticated, hasWallet, router]);

  return null;
}

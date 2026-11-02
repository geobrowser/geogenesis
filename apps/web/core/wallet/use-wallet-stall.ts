'use client';

import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { capture } from '~/core/analytics';
import { restartAuthHost, retryEmbeddedWalletSetup, usePrivy, useWallets } from '~/core/wallet/auth-hooks';
import { accountHasEmbeddedWallet, findEmbeddedWallet } from '~/core/wallet/embedded-wallet';

import {
  AUTO_RESTART_MS,
  RECONNECT_WINDOW_MS,
  WALLET_STALL_GRACE_MS,
  WALLET_STALL_RELOAD_KEY,
  type WalletStallCause,
  afterFailedReconnect,
  walletStallCause,
} from './wallet-stall';

function hasReloaded() {
  try {
    return sessionStorage.getItem(WALLET_STALL_RELOAD_KEY) !== null;
  } catch {
    // Without storage the guard cannot hold, so act as if the reload was already spent.
    return true;
  }
}

function markReloaded() {
  try {
    sessionStorage.setItem(WALLET_STALL_RELOAD_KEY, String(Date.now()));
    return true;
  } catch {
    return false;
  }
}

function send(properties: Record<string, unknown>) {
  try {
    capture('wallet_connection_stalled', properties);
  } catch {
    // Dropped.
  }
}

/**
 * Watches for a signed-in user with no smart account (see `wallet-stall.ts`), and owns the way out:
 * after `WALLET_STALL_GRACE_MS` it reports `stalled`, and `reconnect` refetches the smart account
 * and restarts the embedded wallet setup, restarting Privy too when no wallet has reached the page.
 * A stall still without one at `AUTO_RESTART_MS`, for an account that has one, restarts Privy once by itself. A Reconnect that has
 * not worked within `RECONNECT_WINDOW_MS` reloads the page once per tab; after that, Reconnect is
 * offered again.
 */
export function useWalletStall({
  authenticated,
  address,
  error,
}: {
  authenticated: boolean;
  address: string | null | undefined;
  error: unknown;
}) {
  const queryClient = useQueryClient();
  const { wallets } = useWallets();
  const { user } = usePrivy();
  const hasEmbeddedWallet = Boolean(findEmbeddedWallet(wallets));
  // Tells a wallet that never reached the page from one that was never created.
  const accountHasWallet = accountHasEmbeddedWallet(user);

  const waiting = authenticated && !address;
  const [stalled, setStalled] = React.useState(false);
  const [reconnecting, setReconnecting] = React.useState(false);

  // One stall, from the render `waiting` turned true to the one it turned false.
  const episode = React.useRef<{
    startedAt: number;
    hadError: boolean;
    shownCause: WalletStallCause | null;
    reconnectAttempts: number;
    privyRestarts: number;
  } | null>(null);

  // Read from timers, which would otherwise see the values of the render that set them.
  const latest = React.useRef({ hasEmbeddedWallet, accountHasWallet, error });
  latest.current = { hasEmbeddedWallet, accountHasWallet, error };

  const properties = (phase: 'shown' | 'reloading' | 'ended', cause: WalletStallCause) => {
    const current = episode.current;
    return {
      stall_phase: phase,
      stall_cause: cause,
      stall_ms: current ? Date.now() - current.startedAt : 0,
      reconnect_attempts: current?.reconnectAttempts ?? 0,
      privy_restarts: current?.privyRestarts ?? 0,
      account_has_wallet: latest.current.accountHasWallet,
      after_reload: hasReloaded(),
    };
  };
  const propertiesRef = React.useRef(properties);
  propertiesRef.current = properties;

  React.useEffect(() => {
    if (!waiting) return;

    episode.current = {
      startedAt: Date.now(),
      hadError: Boolean(latest.current.error),
      shownCause: null,
      reconnectAttempts: 0,
      privyRestarts: 0,
    };
    const timer = setTimeout(() => {
      const current = episode.current;
      if (!current) return;
      current.hadError ||= Boolean(latest.current.error);
      current.shownCause = walletStallCause({
        hadError: current.hadError,
        hasEmbeddedWallet: latest.current.hasEmbeddedWallet,
        resolvedOnItsOwn: false,
      });
      send(propertiesRef.current('shown', current.shownCause));
      setStalled(true);
    }, WALLET_STALL_GRACE_MS);

    // Once per stall, and only if nothing has restarted Privy already: by now its own handshake has
    // given up for good. Only for an account that already has a wallet: without one, Privy may still
    // be creating it, and a remount nobody asked for could leave a second one.
    const restartTimer = setTimeout(() => {
      const current = episode.current;
      if (!current || current.privyRestarts > 0 || latest.current.hasEmbeddedWallet || !latest.current.accountHasWallet)
        return;
      current.privyRestarts += 1;
      restartAuthHost();
    }, AUTO_RESTART_MS);

    return () => {
      clearTimeout(timer);
      clearTimeout(restartTimer);
      setStalled(false);
      setReconnecting(false);
    };
  }, [waiting]);

  // An error that a refetch later clears still names the stall.
  React.useEffect(() => {
    if (error && episode.current) episode.current.hadError = true;
  }, [error]);

  // `ended` is sent from here rather than the cleanup above, which cannot tell an account that
  // arrived from a sign-out. Only a stall that was shown is worth one: inside the grace period it is
  // the ordinary wait on every page load.
  React.useEffect(() => {
    const current = episode.current;
    if (!address || !current) return;
    if (current.shownCause) {
      const recoveredBy = current.reconnectAttempts > 0 ? 'reconnect' : current.privyRestarts > 0 ? 'restart' : 'self';
      // Only a stall that ended without help says anything new about its cause.
      const cause =
        recoveredBy === 'self'
          ? walletStallCause({ hadError: current.hadError, hasEmbeddedWallet, resolvedOnItsOwn: true })
          : current.shownCause;
      send({ ...propertiesRef.current('ended', cause), recovered_by: recoveredBy });
    }
    episode.current = null;
  }, [address, hasEmbeddedWallet]);

  React.useEffect(() => {
    if (!authenticated) episode.current = null;
  }, [authenticated]);

  const reconnectTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(
    () => () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    },
    []
  );
  React.useEffect(() => {
    if (waiting || !reconnectTimer.current) return;
    clearTimeout(reconnectTimer.current);
    reconnectTimer.current = null;
  }, [waiting]);

  const reconnect = React.useCallback(() => {
    const current = episode.current;
    if (!current || reconnectTimer.current) return;
    current.reconnectAttempts += 1;
    setReconnecting(true);
    // Refetching cannot help a wallet Privy never listed; only a fresh Privy can, and its wallet setup
    // starts over by itself.
    if (latest.current.hasEmbeddedWallet) {
      retryEmbeddedWalletSetup();
    } else {
      current.privyRestarts += 1;
      restartAuthHost();
    }
    void queryClient.invalidateQueries({ queryKey: ['smart-account'] });

    reconnectTimer.current = setTimeout(() => {
      reconnectTimer.current = null;
      if (episode.current !== current) return;
      if (afterFailedReconnect(hasReloaded()) === 'reload' && markReloaded()) {
        current.hadError ||= Boolean(latest.current.error);
        send(
          propertiesRef.current(
            'reloading',
            current.hadError ? 'smart_account_error' : (current.shownCause ?? 'wallet_never_arrived')
          )
        );
        window.location.reload();
        return;
      }
      setReconnecting(false);
    }, RECONNECT_WINDOW_MS);
  }, [queryClient]);

  return { stalled: waiting && stalled, reconnecting, reconnect };
}

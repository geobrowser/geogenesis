'use client';

import { retryEmbeddedWalletSetup, useWallets } from '@geogenesis/auth';
import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { capture } from '~/core/analytics';

import {
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
 * and restarts the embedded wallet setup. A Reconnect that has not worked within
 * `RECONNECT_WINDOW_MS` reloads the page once per tab; after that, Reconnect is offered again.
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
  const hasEmbeddedWallet = wallets.some(wallet => wallet.walletClientType === 'privy');

  const waiting = authenticated && !address;
  const [stalled, setStalled] = React.useState(false);
  const [reconnecting, setReconnecting] = React.useState(false);

  // One stall, from the render `waiting` turned true to the one it turned false.
  const episode = React.useRef<{
    startedAt: number;
    hadError: boolean;
    shownCause: WalletStallCause | null;
    reconnectAttempts: number;
  } | null>(null);

  // Read from timers, which would otherwise see the values of the render that set them.
  const latest = React.useRef({ hasEmbeddedWallet, error });
  latest.current = { hasEmbeddedWallet, error };

  const properties = (phase: 'shown' | 'reloading' | 'ended', cause: WalletStallCause) => {
    const current = episode.current;
    return {
      stall_phase: phase,
      stall_cause: cause,
      stall_ms: current ? Date.now() - current.startedAt : 0,
      reconnect_attempts: current?.reconnectAttempts ?? 0,
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

    return () => {
      clearTimeout(timer);
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
      const recoveredByReconnect = current.reconnectAttempts > 0;
      const cause = recoveredByReconnect
        ? current.shownCause
        : walletStallCause({ hadError: current.hadError, hasEmbeddedWallet, resolvedOnItsOwn: true });
      send({ ...propertiesRef.current('ended', cause), recovered_by: recoveredByReconnect ? 'reconnect' : 'self' });
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
    retryEmbeddedWalletSetup();
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

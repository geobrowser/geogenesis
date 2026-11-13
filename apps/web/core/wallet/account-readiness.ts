'use client';

import type { GeoWalletClient } from '@geogenesis/auth/account';

import * as React from 'react';

import { captureExperimental } from '~/core/analytics';
import { useSmartAccount } from '~/core/hooks/use-smart-account';

import { usePrivy, useWallets } from './auth-hooks';
import { sessionDetected } from './auth-store';
import { embeddedWalletAddress, findEmbeddedWallet } from './embedded-wallet';

/** Showing who someone is needs `identified`; writing needs `ready_to_write`. */
export type AccountReadinessState = 'signed_out' | 'restoring' | 'identified' | 'ready_to_write' | 'failed';

export function accountReadinessState({
  privyReady,
  authenticated,
  address,
  signingAccount,
  buildFailed,
}: {
  privyReady: boolean;
  authenticated: boolean;
  address: string | null;
  signingAccount: boolean;
  buildFailed: boolean;
}): AccountReadinessState {
  if (!privyReady) return 'restoring';
  if (!authenticated) return 'signed_out';
  if (signingAccount) return 'ready_to_write';
  if (!address) return 'restoring';
  return buildFailed ? 'failed' : 'identified';
}

export function isIdentified(state: AccountReadinessState) {
  return state === 'identified' || state === 'ready_to_write' || state === 'failed';
}

export type AccountReadiness = {
  state: AccountReadinessState;
  address: `0x${string}` | null;
};

export function useAccountReadiness(): AccountReadiness {
  const { ready, authenticated, user } = usePrivy();
  const { smartAccount, error } = useSmartAccount();
  // The restored address first, so caches keyed on it don't change when the signing account arrives.
  const restored = embeddedWalletAddress(user);
  const address = authenticated ? (restored ?? smartAccount?.account.address ?? null) : null;
  const state = accountReadinessState({
    privyReady: ready,
    authenticated,
    address,
    signingAccount: Boolean(smartAccount),
    buildFailed: Boolean(error),
  });
  return React.useMemo(() => ({ state, address: isIdentified(state) ? address : null }), [state, address]);
}

export function useAccountAddress(): `0x${string}` | null {
  return useAccountReadiness().address;
}

/** Not known to be signed out, and can't write yet. */
export function isResolving(state: AccountReadinessState) {
  return state === 'restoring' || state === 'identified' || state === 'failed';
}

export function useAccountResolving(): boolean {
  return isResolving(useAccountReadiness().state);
}

export class SignedOutBeforeWriteError extends Error {
  constructor() {
    super('Signed out before the account was ready to write');
    this.name = 'SignedOutBeforeWriteError';
  }
}

export class SigningAccountFailedError extends Error {
  constructor() {
    super('The signing account could not be built');
    this.name = 'SigningAccountFailedError';
  }
}

type Published = {
  state: AccountReadinessState;
  address: `0x${string}` | null;
  signingAccount: GeoWalletClient | null;
};
const NOTHING_PUBLISHED: Published = { state: 'restoring', address: null, signingAccount: null };
let published = NOTHING_PUBLISHED;
const waiters = new Set<() => boolean>();

export function publishedAccountAddress(): `0x${string}` | null {
  return published.address;
}

function publishReadiness(next: Published) {
  published = next;
  waiters.forEach(settle => {
    if (settle()) waiters.delete(settle);
  });
}

/** Waits for the signing account; rejects if the person is signed out or the build failed. */
export function waitForSigningAccount(): Promise<GeoWalletClient> {
  return new Promise((resolve, reject) => {
    const settle = () => {
      if (published.signingAccount) {
        resolve(published.signingAccount);
        return true;
      }
      if (published.state === 'signed_out') {
        reject(new SignedOutBeforeWriteError());
        return true;
      }
      if (published.state === 'failed') {
        reject(new SigningAccountFailedError());
        return true;
      }
      return false;
    };
    if (!settle()) waiters.add(settle);
  });
}

export function resetPublishedReadiness(next: Partial<Published> = {}) {
  waiters.clear();
  publishReadiness({ ...NOTHING_PUBLISHED, ...next });
}

export function publishReadinessForTests(next: Partial<Published>) {
  publishReadiness({ ...NOTHING_PUBLISHED, ...next });
}

type TimingStep = 'privy_ready' | 'identified' | 'wallet_available' | 'ready_to_write';

function sinceNavigationMs() {
  return typeof performance === 'undefined' ? 0 : Math.round(performance.now());
}

function navigationType(): string | null {
  try {
    const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    return entry?.type ?? null;
  } catch {
    return null;
  }
}

/** Sends how long each step took, once per load that started with a stored session. */
function useReadinessTiming(state: AccountReadinessState, walletAvailable: boolean, privyReady: boolean) {
  const [timed] = React.useState(() => typeof window !== 'undefined' && sessionDetected());
  const steps = React.useRef<Partial<Record<TimingStep, number>>>({});
  const sent = React.useRef(false);

  const send = React.useCallback((outcome: AccountReadinessState | 'left') => {
    if (sent.current) return;
    sent.current = true;
    const properties: Record<string, unknown> = { outcome, navigation_type: navigationType() };
    for (const [step, ms] of Object.entries(steps.current)) properties[`${step}_ms`] = ms;
    try {
      captureExperimental('experimental.account_readiness_timing', properties);
    } catch {}
  }, []);

  React.useEffect(() => {
    if (!timed || sent.current) return;
    const mark = (step: TimingStep, reached: boolean) => {
      if (reached && steps.current[step] === undefined) steps.current[step] = sinceNavigationMs();
    };
    mark('privy_ready', privyReady);
    mark('identified', isIdentified(state));
    mark('wallet_available', walletAvailable);
    mark('ready_to_write', state === 'ready_to_write');
    if (state === 'ready_to_write' || state === 'failed' || state === 'signed_out') send(state);
  }, [timed, state, walletAvailable, privyReady, send]);

  React.useEffect(() => {
    if (!timed) return;
    const left = () => send('left');
    window.addEventListener('pagehide', left);
    return () => window.removeEventListener('pagehide', left);
  }, [timed, send]);
}

export function AccountReadinessSync() {
  const { state, address } = useAccountReadiness();
  const { smartAccount } = useSmartAccount();
  const { ready } = usePrivy();
  const { wallets } = useWallets();

  React.useEffect(() => {
    publishReadiness({ state, address, signingAccount: smartAccount });
  }, [state, address, smartAccount]);

  useReadinessTiming(state, Boolean(findEmbeddedWallet(wallets)), ready);
  return null;
}

'use client';

import { useIdentityToken } from '@geogenesis/auth';

import * as React from 'react';

import { useSmartAccount } from './use-smart-account';

/** Bounds the wait for a signed-in account, so a stale wallet cookie can't hold the page up. */
export const SIGNED_IN_ACCOUNT_WAIT_MS = 5_000;

/**
 * The smart-account address, and whether a reader we believe is signed in is still waiting for it.
 *
 * Privy restores the wallet a beat after hydration, so on the first renders a signed-in reader's
 * account reads as null, exactly like a signed-out one. A query keyed on the address then runs
 * anonymously, renders, and runs again once the address arrives — two requests and a flash of the
 * wrong content. `signedIn` comes from the httpOnly wallet cookie, which the server can read before
 * Privy can; while it is set and the account has not resolved, `awaitingAccount` is true, for at
 * most `SIGNED_IN_ACCOUNT_WAIT_MS`.
 */
export function useAwaitedSmartAccount(signedIn: boolean) {
  const { smartAccount } = useSmartAccount();
  const smartAccountAddress = smartAccount?.account.address ?? null;

  const [waitOver, setWaitOver] = React.useState(false);
  const awaitingAccount = signedIn && smartAccountAddress === null && !waitOver;
  React.useEffect(() => {
    if (!awaitingAccount) return;
    const timer = setTimeout(() => setWaitOver(true), SIGNED_IN_ACCOUNT_WAIT_MS);
    return () => clearTimeout(timer);
  }, [awaitingAccount]);

  return { smartAccountAddress, awaitingAccount };
}

/**
 * The address a feed request is made for, and whether that request must wait before it is sent.
 *
 * Unlike `useAwaitedSmartAccount`, this does not wait for the account. The feed routes read the
 * wallet cookie themselves, so on the client the address only keys the cache, and the cookie the
 * server rendered the page with holds the very address `useSmartAccount` reports once ZeroDev has
 * built the account (it writes the cookie from it). Seeding the key from the cookie lets the first
 * page go out at hydration, and it stays the same key when the account arrives, so nothing refetches.
 *
 * A request that carries a Privy identity token (`needsIdentityToken`) still has to wait, but only
 * for that token, which Privy restores without building the account; at most
 * `SIGNED_IN_ACCOUNT_WAIT_MS`, after which it goes without one.
 */
export function useFeedViewer(cookieAddress: string | null, needsIdentityToken: boolean) {
  const { smartAccount } = useSmartAccount();
  const { identityToken } = useIdentityToken();
  const smartAccountAddress = smartAccount?.account.address ?? null;

  const [waitOver, setWaitOver] = React.useState(false);
  const awaitingIdentityToken =
    needsIdentityToken && cookieAddress !== null && smartAccountAddress === null && identityToken === null && !waitOver;
  React.useEffect(() => {
    if (!awaitingIdentityToken) return;
    const timer = setTimeout(() => setWaitOver(true), SIGNED_IN_ACCOUNT_WAIT_MS);
    return () => clearTimeout(timer);
  }, [awaitingIdentityToken]);

  return { viewerAddress: smartAccountAddress ?? cookieAddress, awaitingIdentityToken };
}

'use client';

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

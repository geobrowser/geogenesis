'use client';

import { useIdentityToken, usePrivy } from '@geogenesis/auth';

import * as React from 'react';

import { useSmartAccount } from './use-smart-account';

/** Bounds the wait for a signed-in account, so a stale wallet cookie can't hold the page up. */
export const SIGNED_IN_ACCOUNT_WAIT_MS = 5_000;

/**
 * Whether Privy has finished restoring and found no session. The wallet cookie outlives the Privy
 * session (it is cleared on logout, not on expiry), so a reader whose session lapsed still carries
 * it; without this every wait below ran its full `SIGNED_IN_ACCOUNT_WAIT_MS` on every page load,
 * with the feed held on skeletons the whole time. `ready` comes well under a second in, and before
 * it Privy reports `authenticated: false` while restoring, which is not a sign-out.
 */
function usePrivySignedOut() {
  const { ready, authenticated } = usePrivy();
  return ready && !authenticated;
}

/** Only once per page: the route is a no-op when the cookie is already gone. */
let staleWalletCookieCleared = false;

/**
 * Drops a wallet cookie Privy no longer has a session for, so the next load is served as the
 * signed-out reader this is (the cached public feed, no waits). A route rather than the
 * `onConnectionChange` Server Action, because a cookie write in a Server Action re-renders the
 * current page from the server, which would swap the feed under the reader.
 */
function useClearStaleWalletCookie(cookieAddress: string | null, signedOut: boolean) {
  React.useEffect(() => {
    if (!signedOut || cookieAddress === null || staleWalletCookieCleared) return;
    staleWalletCookieCleared = true;
    fetch('/api/wallet-cookie', { method: 'DELETE' }).catch(() => {
      staleWalletCookieCleared = false;
    });
  }, [cookieAddress, signedOut]);
}

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
  const signedOut = usePrivySignedOut();

  const [waitOver, setWaitOver] = React.useState(false);
  const awaitingAccount = signedIn && !signedOut && smartAccountAddress === null && !waitOver;
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
 * `SIGNED_IN_ACCOUNT_WAIT_MS`, after which it goes without one. It stops waiting as soon as Privy
 * has restored and found no session, and clears the stale cookie that started the wait.
 */
export function useFeedViewer(cookieAddress: string | null, needsIdentityToken: boolean) {
  const { smartAccount } = useSmartAccount();
  const { identityToken } = useIdentityToken();
  const smartAccountAddress = smartAccount?.account.address ?? null;
  const signedOut = usePrivySignedOut();
  useClearStaleWalletCookie(cookieAddress, signedOut);

  const [waitOver, setWaitOver] = React.useState(false);
  const awaitingIdentityToken =
    needsIdentityToken &&
    cookieAddress !== null &&
    !signedOut &&
    smartAccountAddress === null &&
    identityToken === null &&
    !waitOver;
  React.useEffect(() => {
    if (!awaitingIdentityToken) return;
    const timer = setTimeout(() => setWaitOver(true), SIGNED_IN_ACCOUNT_WAIT_MS);
    return () => clearTimeout(timer);
  }, [awaitingIdentityToken]);

  return { viewerAddress: smartAccountAddress ?? cookieAddress, awaitingIdentityToken };
}

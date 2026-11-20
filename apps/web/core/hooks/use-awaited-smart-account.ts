'use client';

import * as React from 'react';

import { useWalletSessionSync } from '~/core/auth/wallet-session-sync';
import { useAccountAddress } from '~/core/wallet/account-readiness';
import { useIdentityToken, usePrivy } from '~/core/wallet/auth-hooks';

/** Bounds the wait for a signed-in account, so a stale wallet session can't hold the page up. */
export const SIGNED_IN_ACCOUNT_WAIT_MS = 5_000;

/**
 * Whether Privy has finished restoring and found no session. The wallet session outlives the Privy
 * session (it is cleared on logout, not on expiry), so a reader whose session lapsed still carries
 * it; without this every wait below ran its full `SIGNED_IN_ACCOUNT_WAIT_MS` on every page load,
 * with the feed held on skeletons the whole time. `ready` comes well under a second in, and before
 * it Privy reports `authenticated: false` while restoring, which is not a sign-out.
 */
function usePrivySignedOut() {
  const { ready, authenticated } = usePrivy();
  return ready && !authenticated;
}

/**
 * The smart-account address, and whether a reader we believe is signed in is still waiting for it.
 *
 * Privy restores the wallet a beat after hydration, so on the first renders a signed-in reader's
 * account reads as null, exactly like a signed-out one. A query keyed on the address then runs
 * anonymously, renders, and runs again once the address arrives — two requests and a flash of the
 * wrong content. `signedIn` comes from the verified wallet session, which the server can read before
 * Privy can; while it is set and the account has not resolved, `awaitingAccount` is true, for at
 * most `SIGNED_IN_ACCOUNT_WAIT_MS`.
 */
export function useAwaitedSmartAccount(signedIn: boolean) {
  const smartAccountAddress = useAccountAddress();
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
 * wallet session themselves, so on the client the address only keys the cache, and it must be the
 * address the server reads. The restored account replaces the session's address only once the
 * server's session holds it; until then a missing or previous viewer's session would be answered for
 * someone else. Seeding the key from the session lets the first page go out at hydration, and when it
 * already matches it stays the same key when the account arrives, so nothing refetches.
 *
 * A request that carries a Privy identity token (`needsIdentityToken`) still has to wait, but only
 * for that token, which Privy restores without building the account; at most
 * `SIGNED_IN_ACCOUNT_WAIT_MS`, after which it goes without one. It stops waiting as soon as Privy
 * has restored and found no session (`WalletSessionSync` then clears the stale session).
 */
export function useFeedViewer(sessionAddress: string | null, needsIdentityToken: boolean) {
  const { identityToken } = useIdentityToken();
  const accountAddress = useAccountAddress();
  const { synced } = useWalletSessionSync(accountAddress);
  const smartAccountAddress =
    accountAddress && sessionAddress?.toLowerCase() === accountAddress.toLowerCase()
      ? sessionAddress
      : synced
        ? accountAddress
        : null;
  const signedOut = usePrivySignedOut();

  const [waitOver, setWaitOver] = React.useState(false);
  const awaitingIdentityToken =
    needsIdentityToken &&
    sessionAddress !== null &&
    !signedOut &&
    smartAccountAddress === null &&
    identityToken === null &&
    !waitOver;
  React.useEffect(() => {
    if (!awaitingIdentityToken) return;
    const timer = setTimeout(() => setWaitOver(true), SIGNED_IN_ACCOUNT_WAIT_MS);
    return () => clearTimeout(timer);
  }, [awaitingIdentityToken]);

  return { viewerAddress: smartAccountAddress ?? sessionAddress, awaitingIdentityToken };
}

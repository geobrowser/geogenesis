import { useLoginWithEmail as usePrivyLoginWithEmail, usePrivy, useWallets } from '@privy-io/react-auth';
import { useSetActiveWallet } from '@privy-io/wagmi';

import { useEffect, useRef } from 'react';

type UseLoginWithEmailParams = Parameters<typeof usePrivyLoginWithEmail>[0];

/**
 * Privy's headless email login, with the wallet activation `useGeoLogin` performs.
 *
 * That activation is not optional. `setActiveWallet` is what puts the wallet into wagmi's context;
 * without it `useWalletClient` stays empty, `useSmartAccount` resolves no address, and everything
 * keyed on that address behaves as though nobody signed in — `usePersonalSpaceId` never runs the
 * query whose result decides a new account needs onboarding. The session exists, and nothing in the
 * app reflects it: no wallet, no onboarding, and a login button that does nothing because Privy is
 * quite correct that you are already logged in.
 *
 * Done in an effect rather than in `onComplete`, which is where `useGeoLogin` does it. Two reasons,
 * and it is not obvious from the outside which one bites:
 *
 *  - Whether the headless hook fires `login` callbacks at all is not something the types promise.
 *  - `onComplete` closes over the render's `wallets`, and the embedded wallet is created *during*
 *    login. If the array in that closure predates it, the lookup finds nothing and silently does
 *    nothing — a one-shot callback with no second chance.
 *
 * An effect has neither problem: it re-runs as `wallets` fills in, and it does not care how login
 * completed. Guarded on the address actually activated so a changing `wallets` identity cannot make
 * it loop.
 */
export function useGeoLoginWithEmail(params?: UseLoginWithEmailParams) {
  const { setActiveWallet } = useSetActiveWallet();
  const { wallets } = useWallets();
  const { authenticated, user } = usePrivy();

  const activatedAddressRef = useRef<string | null>(null);
  const walletAddress = user?.wallet?.address;

  useEffect(() => {
    if (!authenticated || !walletAddress) return;
    if (activatedAddressRef.current === walletAddress) return;

    const wallet = wallets.find(wallet => wallet.address === walletAddress);
    if (!wallet) return;

    activatedAddressRef.current = walletAddress;
    void setActiveWallet(wallet);
  }, [authenticated, walletAddress, wallets, setActiveWallet]);

  // Cleared on sign-out so the next session activates again rather than being skipped as a repeat.
  useEffect(() => {
    if (!authenticated) activatedAddressRef.current = null;
  }, [authenticated]);

  return usePrivyLoginWithEmail(params);
}

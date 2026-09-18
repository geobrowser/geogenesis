import {
  useCreateWallet,
  useLoginWithEmail as usePrivyLoginWithEmail,
  usePrivy,
  useWallets,
} from '@privy-io/react-auth';
import { useSetActiveWallet } from '@privy-io/wagmi';

import { useEffect, useRef } from 'react';

type UseLoginWithEmailParams = Parameters<typeof usePrivyLoginWithEmail>[0];

/** What `useSmartAccount` looks for: Privy's own embedded wallet, not a linked external one. */
const EMBEDDED_WALLET_TYPE = 'privy';

/**
 * Privy's headless email login, with the two things the modal flow does afterwards and this one
 * does not: create the embedded wallet, and put it into wagmi's context.
 *
 * `embeddedWallets.createOnLogin: 'all-users'` is configured, and it is part of the *modal* login
 * flow. Authenticating headlessly skips it, which the browser console says plainly —
 * "authenticated Privy user has no embedded Ethereum wallet" — and everything after that follows:
 * no wallet means `useWalletClient` is empty, `useSmartAccount` resolves no address,
 * `usePersonalSpaceId` never runs the query whose result decides a new account needs onboarding,
 * and the chat session endpoint answers 401. The session is real the whole time, which is why the
 * login button goes quiet: Privy is right that you are already logged in.
 *
 * Both steps run from effects rather than a login callback. An effect re-runs as `wallets` fills
 * in, and does not depend on whether the headless hook fires `login` callbacks at all — which the
 * types do not promise. Every Privy callback is held in a ref: a hook returns new identities each
 * render, and naming one as a dependency re-fires the effect, which here would mean asking for a
 * second wallet.
 */
export function useGeoLoginWithEmail(params?: UseLoginWithEmailParams) {
  const { setActiveWallet } = useSetActiveWallet();
  const { wallets } = useWallets();
  const { authenticated, user } = usePrivy();
  const { createWallet } = useCreateWallet();

  const createWalletRef = useRef(createWallet);
  createWalletRef.current = createWallet;
  const setActiveWalletRef = useRef(setActiveWallet);
  setActiveWalletRef.current = setActiveWallet;

  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === EMBEDDED_WALLET_TYPE);
  const linkedWalletAddress = user?.wallet?.address;

  // Create it, once. `createWallet` throws if one already exists, so the guard is not only about
  // waste — a second call is an error, and an error here would be the same dead end as no wallet.
  const requestedWalletRef = useRef(false);
  useEffect(() => {
    if (!authenticated || embeddedWallet || requestedWalletRef.current) return;

    requestedWalletRef.current = true;
    void createWalletRef.current().catch(() => {
      // Already created by something else, or Privy refused. Either way the effect below activates
      // whatever does turn up, and retrying here would only loop.
    });
  }, [authenticated, embeddedWallet]);

  // Activate whichever wallet the session ends up with, when it turns up. Keyed on the address so
  // a changing `wallets` identity cannot make this loop.
  const activatedAddressRef = useRef<string | null>(null);
  const walletToActivate =
    embeddedWallet ?? (linkedWalletAddress ? wallets.find(w => w.address === linkedWalletAddress) : undefined);

  useEffect(() => {
    if (!authenticated || !walletToActivate) return;
    if (activatedAddressRef.current === walletToActivate.address) return;

    activatedAddressRef.current = walletToActivate.address;
    void setActiveWalletRef.current(walletToActivate);
  }, [authenticated, walletToActivate]);

  // Cleared on sign-out so the next session is not skipped as a repeat of this one.
  useEffect(() => {
    if (!authenticated) {
      requestedWalletRef.current = false;
      activatedAddressRef.current = null;
    }
  }, [authenticated]);

  return usePrivyLoginWithEmail(params);
}

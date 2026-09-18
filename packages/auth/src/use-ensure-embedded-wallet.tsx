import { useCreateWallet, usePrivy, useWallets } from '@privy-io/react-auth';
import { useSetActiveWallet } from '@privy-io/wagmi';

import { useEffect, useRef } from 'react';

/** What `useSmartAccount` looks for: Privy's own embedded wallet, not a linked external one. */
const EMBEDDED_WALLET_TYPE = 'privy';

/**
 * Keeps an authenticated session holding an embedded wallet that wagmi knows about.
 *
 * `embeddedWallets.createOnLogin: 'all-users'` is configured, but it belongs to the *modal* login
 * flow. A headless login authenticates without it, and the browser console says so plainly —
 * "authenticated Privy user has no embedded Ethereum wallet". Everything downstream follows: no
 * wallet means `useWalletClient` is empty, `useSmartAccount` resolves no address,
 * `usePersonalSpaceId` never runs the query whose result decides a new account needs onboarding,
 * and the chat session endpoint answers 401 on a loop.
 *
 * Mounted for the life of the app rather than wherever a login happens to start, which is the
 * correction this hook exists to make. The first version lived in the sign-up card, and the card's
 * own visibility rule unmounts it the moment `authenticated` turns true — the exact render in which
 * this work becomes possible. It tore itself down before it could run. Anything that reacts to
 * becoming authenticated cannot live in something that disappears on becoming authenticated.
 *
 * Every Privy callback is held in a ref: a hook returns new identities each render, and naming one
 * as an effect dependency re-fires it, which here would mean asking for a second wallet.
 */
export function useEnsureEmbeddedWallet() {
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

  // Created once. `createWallet` throws when one already exists, so a repeat is not merely wasteful
  // -- it is an error, and an error here is the same dead end as having no wallet.
  const requestedWalletRef = useRef(false);
  useEffect(() => {
    if (!authenticated || embeddedWallet || requestedWalletRef.current) return;

    requestedWalletRef.current = true;
    void createWalletRef.current().catch(() => {
      // Already created elsewhere, or Privy refused. The effect below activates whatever turns up,
      // and retrying here would only loop.
    });
  }, [authenticated, embeddedWallet]);

  // Activate whatever the session ends up with, once it exists. Keyed on the address so a changing
  // `wallets` identity cannot make this loop. A modal login has usually done this already, via
  // `useGeoLogin`; this is then a no-op rather than a second path fighting the first.
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
}

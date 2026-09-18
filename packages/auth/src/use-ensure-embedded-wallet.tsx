import { useCreateWallet, usePrivy, useWallets } from '@privy-io/react-auth';
import { useSetActiveWallet } from '@privy-io/wagmi';

import { useEffect, useRef } from 'react';

/** What `useSmartAccount` looks for: Privy's own embedded wallet, not a linked external one. */
const EMBEDDED_WALLET_TYPE = 'privy';

/**
 * How many times to ask Privy for a wallet before leaving it alone.
 *
 * Enough that a dropped request or a blip recovers without the reader noticing, few enough that an
 * account Privy will not make a wallet for does not sit in a loop asking forever.
 */
const MAX_WALLET_ATTEMPTS = 3;

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

  // In flight, not "has ever been attempted". Marking it done up front made any failure permanent:
  // one dropped request and the session was stuck without a wallet until a reload, with every
  // smart-account path behaving as though nobody had signed in. The flag is released on failure so
  // a later render can try again -- bounded, because retrying forever against a Privy that is
  // refusing this account would be its own kind of broken.
  const walletAttemptRef = useRef({ inFlight: false, attempts: 0 });
  useEffect(() => {
    const attempt = walletAttemptRef.current;
    if (!authenticated || embeddedWallet || attempt.inFlight || attempt.attempts >= MAX_WALLET_ATTEMPTS) return;

    attempt.inFlight = true;
    attempt.attempts += 1;

    void createWalletRef.current()
      .catch(() => {
        // Either something else created it first -- in which case `embeddedWallet` is about to
        // appear and the guard above will stop us -- or the request genuinely failed and the next
        // render is welcome to try.
      })
      .finally(() => {
        walletAttemptRef.current.inFlight = false;
      });
  }, [authenticated, embeddedWallet]);

  // Activate whatever the session ends up with, once it exists. Keyed on the address so a changing
  // `wallets` identity cannot make this loop. A modal login has usually done this already, via
  // `useGeoLogin`; this is then a no-op rather than a second path fighting the first.
  //
  // The address is recorded only once activation has actually resolved. Recorded up front, a failed
  // activation looked exactly like a successful one to every later render, and wagmi stayed empty
  // for the rest of the session -- the precise failure this hook exists to prevent, reintroduced by
  // the bookkeeping meant to make it efficient.
  const activatedAddressRef = useRef<string | null>(null);
  const activatingRef = useRef(false);
  const walletToActivate =
    embeddedWallet ?? (linkedWalletAddress ? wallets.find(w => w.address === linkedWalletAddress) : undefined);

  useEffect(() => {
    if (!authenticated || !walletToActivate) return;
    if (activatedAddressRef.current === walletToActivate.address || activatingRef.current) return;

    const { address } = walletToActivate;
    activatingRef.current = true;

    void Promise.resolve(setActiveWalletRef.current(walletToActivate))
      .then(() => {
        activatedAddressRef.current = address;
      })
      .catch(() => {
        // Left unrecorded on purpose, so the next render tries again rather than believing a wallet
        // is active when it is not.
      })
      .finally(() => {
        activatingRef.current = false;
      });
  }, [authenticated, walletToActivate]);

  // Cleared on sign-out so the next session is not skipped as a repeat of this one.
  useEffect(() => {
    if (!authenticated) {
      walletAttemptRef.current = { inFlight: false, attempts: 0 };
      activatedAddressRef.current = null;
      activatingRef.current = false;
    }
  }, [authenticated]);
}

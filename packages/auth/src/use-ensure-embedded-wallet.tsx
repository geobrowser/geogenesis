import { useCreateWallet, usePrivy, useWallets } from '@privy-io/react-auth';
import { useSetActiveWallet } from '@privy-io/wagmi';

import { useEffect, useRef, useState } from 'react';

/** What `useSmartAccount` looks for: Privy's own embedded wallet, not a linked external one. */
const EMBEDDED_WALLET_TYPE = 'privy';

/**
 * How many times to ask before leaving it alone.
 *
 * Enough that a dropped request recovers without the reader noticing, few enough that an account
 * Privy will not serve does not sit in a loop asking forever.
 */
const MAX_ATTEMPTS = 3;

/**
 * How long to wait before asking again after a failure.
 *
 * Long enough not to retry straight back into the same blip, short enough that nobody is left
 * watching an empty onboarding screen while it waits.
 */
const RETRY_DELAY_MS = 2_000;

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
 * Mounted for the life of the app rather than wherever a login happens to start. The first version
 * lived in the sign-up card, whose own visibility rule unmounts it the moment `authenticated` turns
 * true — the exact render in which this work becomes possible. It tore itself down before it could
 * run. Anything reacting to *becoming* authenticated cannot live in something that disappears on
 * becoming authenticated.
 *
 * Both steps retry through state rather than a ref, which is the correction that matters most here.
 * An earlier version cleared an `inFlight` ref in `.finally()` and called that a bounded retry: a
 * ref does not re-render, and neither dependency changes when a request fails, so the effect never
 * ran again. Three attempts in the comment, one in practice — and the tests agreed only because
 * they called `rerender()` themselves, which nothing does in a browser. Changing a counter in state
 * is what actually schedules the next run.
 *
 * Every Privy callback is held in a ref: a hook returns new identities each render, and naming one
 * as an effect dependency re-fires it — here, asking for a second wallet.
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
  const walletToActivate =
    embeddedWallet ?? (linkedWalletAddress ? wallets.find(w => w.address === linkedWalletAddress) : undefined);

  const [createAttempts, setCreateAttempts] = useState(0);
  const activatedAddressRef = useRef<string | null>(null);

  // Attempts are counted per address, not per session, and the effect below is keyed by address
  // rather than by the wallet object. Both matter, and for different reasons.
  //
  // A session-wide count is wrong because the target changes: while the embedded wallet is still
  // being created, a linked wallet can burn all three attempts, and the embedded wallet then
  // inherits an exhausted budget and is never activated — leaving `useSmartAccount` without the
  // one wallet it actually needs.
  //
  // Keying on the object is wrong because Privy can hand back a new object for the same address.
  // That re-runs the effect, whose cleanup marks the in-flight attempt cancelled, so a *successful*
  // activation is discarded as stale while a second one is already running for the same wallet.
  const [activateAttempts, setActivateAttempts] = useState<Record<string, number>>({});
  const addressToActivate = walletToActivate?.address;
  const attemptsForAddress = addressToActivate ? (activateAttempts[addressToActivate] ?? 0) : 0;

  useEffect(() => {
    if (!authenticated || embeddedWallet || createAttempts >= MAX_ATTEMPTS) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    void createWalletRef.current().catch(() => {
      // Either something else created it first — in which case `embeddedWallet` is about to appear
      // and the guard above stops us — or it genuinely failed and we try again.
      if (cancelled) return;
      timer = setTimeout(() => setCreateAttempts(attempts => attempts + 1), RETRY_DELAY_MS);
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [authenticated, embeddedWallet, createAttempts]);

  // `walletToActivate` is read through a ref so that a new object for the same address does not
  // re-run this; the address is the dependency.
  const walletToActivateRef = useRef(walletToActivate);
  walletToActivateRef.current = walletToActivate;

  useEffect(() => {
    if (!authenticated || !addressToActivate) return;
    if (activatedAddressRef.current === addressToActivate) return;
    if (attemptsForAddress >= MAX_ATTEMPTS) return;

    const wallet = walletToActivateRef.current;
    if (!wallet) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    void Promise.resolve(setActiveWalletRef.current(wallet))
      .then(() => {
        // Recorded on resolve, never before. Recorded up front, a failed activation was
        // indistinguishable from a successful one to every later render, and wagmi stayed empty for
        // the rest of the session.
        if (!cancelled) activatedAddressRef.current = addressToActivate;
      })
      .catch(() => {
        if (cancelled) return;
        timer = setTimeout(
          () =>
            setActivateAttempts(attempts => ({
              ...attempts,
              [addressToActivate]: (attempts[addressToActivate] ?? 0) + 1,
            })),
          RETRY_DELAY_MS
        );
      });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [authenticated, addressToActivate, attemptsForAddress]);

  // Cleared on sign-out so the next session is not skipped as a repeat of this one.
  useEffect(() => {
    if (authenticated) return;
    activatedAddressRef.current = null;
    setCreateAttempts(0);
    setActivateAttempts({});
  }, [authenticated]);
}

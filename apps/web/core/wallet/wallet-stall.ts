/**
 * GEO-3245. Privy can say someone is signed in while their smart account has not resolved, and the
 * navbar used to read that as signed out: it showed Log in, which does nothing for a signed-in user
 * (Privy's `login()` is a no-op then). On 8 Oct one user pressed it 32 times in 8 minutes.
 *
 * `useSmartAccount` comes back empty, and not loading, in three ways. These are the names the
 * `wallet_connection_stalled` event reports them under:
 *
 * - `waiting_for_wallet`: Privy has not connected the embedded wallet yet (or the smart account is
 *   still being built from it), and it gets there late without anyone's help.
 * - `wallet_never_arrived`: the same, but it never gets there. The account already has an embedded
 *   wallet, so `useEnsureEmbeddedWallet` does not create one, and there is nothing in `useWallets()`
 *   for it to activate. Until GEO-3245 nothing retried short of a page load.
 * - `smart_account_error`: building the smart account failed (Privy signing, ZeroDev RPC).
 */

/** How long a signed-in navbar waits for the account before offering Reconnect. */
export const WALLET_STALL_GRACE_MS = 5_000;

/** How long a Reconnect is given before it counts as failed. */
export const RECONNECT_WINDOW_MS = 10_000;

/**
 * Set before the one reload a failed Reconnect earns, and never cleared in the tab: a session that
 * has already reloaded once gets Reconnect again rather than a second reload.
 */
export const WALLET_STALL_RELOAD_KEY = 'geo:wallet-stall:reloaded';

export type NavbarAccountState = 'loading' | 'signed_out' | 'account' | 'stalled';

export function navbarAccountState({
  authenticated,
  isLoading,
  hasAddress,
  hasHeldIdentity,
  stalled,
}: {
  authenticated: boolean;
  /** The smart account or its profile is still resolving. */
  isLoading: boolean;
  /** A resolved address, or the held one standing in for a mid-session re-resolve. */
  hasAddress: boolean;
  hasHeldIdentity: boolean;
  /** The grace period ran out with the user still signed in and no account. */
  stalled: boolean;
}): NavbarAccountState {
  // Before anything about loading: an empty, not-loading smart account is exactly the case that
  // used to fall through to Log in.
  if (authenticated && !hasAddress) return stalled ? 'stalled' : 'loading';
  if (isLoading && !hasHeldIdentity) return 'loading';
  if (!hasAddress) return 'signed_out';
  return 'account';
}

export type WalletStallCause = 'waiting_for_wallet' | 'wallet_never_arrived' | 'smart_account_error';

export function walletStallCause({
  hadError,
  hasEmbeddedWallet,
  resolvedOnItsOwn,
}: {
  /** The smart account query failed at any point in this stall, even if a retry has cleared it. */
  hadError: boolean;
  hasEmbeddedWallet: boolean;
  /** The account arrived without a Reconnect or a reload. */
  resolvedOnItsOwn: boolean;
}): WalletStallCause {
  if (hadError) return 'smart_account_error';
  if (hasEmbeddedWallet || resolvedOnItsOwn) return 'waiting_for_wallet';
  return 'wallet_never_arrived';
}

export type ReconnectOutcome = 'reload' | 'retry_again';

/** What a Reconnect that did not bring the account back leads to. */
export function afterFailedReconnect(alreadyReloaded: boolean): ReconnectOutcome {
  return alreadyReloaded ? 'retry_again' : 'reload';
}

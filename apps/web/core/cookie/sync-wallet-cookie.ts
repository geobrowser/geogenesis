import { getCachedIdentityToken, setCachedIdentityToken } from '~/core/auth/identity-token';

import { onConnectionChange } from './cookie';

/**
 * The address this tab last had the server recognise. Module scope, so it outlives the
 * smart-account query's refetches and resets with the page.
 *
 * `onConnectionChange` already skips the cookie write when nothing changed, but the call itself is
 * still a Server Action round trip, and `useSmartAccount` refetches on every mount once 30s stale.
 * After a deploy, an open tab's action id may no longer exist, so each of those calls would fail
 * and mark the smart-account query as errored. Calling only when the address changes avoids both.
 */
let syncedAddress: string | null = null;

/**
 * Delays before trying again when there was no identity token yet, or the server recognised no
 * wallet. Nothing else re-runs the sync — the smart-account query is keyed on wallet addresses, not
 * the token — so without these an idle tab could stay unrecognised by the server until an
 * unrelated refetch. Spaced past `getCachedIdentityToken`'s 30s cooldown after a failed fetch, and
 * bounded: past the last one, the next smart-account run picks it up as before.
 */
export const SYNC_RETRY_DELAYS_MS = [5_000, 15_000, 35_000, 60_000] as const;

let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryAttempt = 0;
let retryAddress: `0x${string}` | null = null;

function clearRetry() {
  if (retryTimer !== null) clearTimeout(retryTimer);
  retryTimer = null;
  retryAttempt = 0;
  retryAddress = null;
}

function scheduleRetry(address: `0x${string}`) {
  // The latest address wins, so a retry never re-asks about a wallet this tab has left.
  retryAddress = address;
  if (retryTimer !== null || retryAttempt >= SYNC_RETRY_DELAYS_MS.length) return;

  retryTimer = setTimeout(() => {
    retryTimer = null;
    const pending = retryAddress;
    // A failure here is left for the next smart-account run, which reports it.
    if (pending) syncWalletCookie(pending).catch(() => {});
  }, SYNC_RETRY_DELAYS_MS[retryAttempt++]);
}

/**
 * Has the server recognise `address` as this tab's wallet. The server takes the wallet from the
 * Privy identity token, not from `address` (GEO-3107), so `address` only decides whether a call
 * is needed and whether the answer matches.
 */
export async function syncWalletCookie(address: `0x${string}`) {
  if (syncedAddress === address.toLowerCase()) return;

  // No token yet means Privy has not finished signing in. Retry shortly rather than failing the
  // smart-account query over it.
  const identityToken = await getCachedIdentityToken();
  if (!identityToken) return scheduleRetry(address);

  const recognised = await onConnectionChange({ type: 'connect', identityToken });
  if (recognised?.toLowerCase() === address.toLowerCase()) {
    syncedAddress = recognised.toLowerCase();
    clearRetry();
    return;
  }
  // A different wallet means the token is not this tab's current account: the identity-token cache
  // is only kept current while a debates or community-call hook is mounted, so after an account
  // switch it can still hold the previous account's token. Drop it so the retry fetches this one.
  // Null is a token that could not be verified (Privy's keys unreachable), which can pass.
  if (recognised !== null) setCachedIdentityToken(null);
  scheduleRetry(address);
}

/**
 * Call when the wallet goes away, so signing back in with the same one writes the cookie again. The
 * cached identity token belonged to the account that left, so it goes too — otherwise the next
 * sign-in could send it. Only when this tab had a wallet, so signed-out visitors do not keep
 * resetting a cache the debates hooks share.
 */
export function forgetSyncedWalletCookie() {
  if (syncedAddress !== null || retryAddress !== null) setCachedIdentityToken(null);
  syncedAddress = null;
  clearRetry();
}

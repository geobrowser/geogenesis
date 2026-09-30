import { getCachedIdentityToken } from '~/core/auth/identity-token';

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
 * Has the server recognise `address` as this tab's wallet. The server takes the wallet from the
 * Privy identity token, not from `address` (GEO-3107), so `address` only decides whether a call
 * is needed and whether the answer matches.
 */
export async function syncWalletCookie(address: `0x${string}`) {
  if (syncedAddress === address.toLowerCase()) return;

  // No token yet means Privy has not finished signing in. Leave it for the next run rather than
  // failing the smart-account query over it.
  const identityToken = await getCachedIdentityToken();
  if (!identityToken) return;

  const recognised = await onConnectionChange({ type: 'connect', identityToken });
  // Remembered only once the server vouches for this same wallet, so anything else is retried.
  if (recognised?.toLowerCase() === address.toLowerCase()) syncedAddress = recognised.toLowerCase();
}

/** Call when the wallet goes away, so signing back in with the same one writes the cookie again. */
export function forgetSyncedWalletCookie() {
  syncedAddress = null;
}

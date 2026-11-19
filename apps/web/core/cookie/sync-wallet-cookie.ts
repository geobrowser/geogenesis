import { onConnectionChange } from './cookie';

/**
 * The address this tab last wrote to the wallet cookie. Module scope, so it outlives the cookie
 * query's refetches and resets with the page.
 *
 * `onConnectionChange` already skips the cookie write when nothing changed, but the call itself is
 * still a Server Action round trip, and the cookie query (`useWalletCookieSync`) runs again when it
 * is mounted after the cache has dropped it. After a deploy, an open tab's action id may no longer
 * exist, so each of those calls would fail. Calling only when the address changes avoids both.
 */
let syncedAddress: string | null = null;

export async function syncWalletCookie(address: `0x${string}`) {
  if (syncedAddress === address) return;
  await onConnectionChange({ type: 'connect', address });
  // Set only after the write lands, so a failed call is retried on the next run.
  syncedAddress = address;
}

/** Call when the wallet goes away, so signing back in with the same one writes the cookie again. */
export function forgetSyncedWalletCookie() {
  syncedAddress = null;
}

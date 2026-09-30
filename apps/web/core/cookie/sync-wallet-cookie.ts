import { onConnectionChange } from './cookie';

/**
 * The address this tab last wrote to the wallet cookie. Module scope, so it outlives the
 * smart-account query's refetches and resets with the page.
 *
 * `onConnectionChange` already skips the cookie write when nothing changed, but the call itself is
 * still a Server Action round trip, and `useSmartAccount` refetches on every mount once 30s stale.
 * After a deploy, an open tab's action id may no longer exist, so each of those calls would fail
 * and mark the smart-account query as errored. Calling only when the address changes avoids both.
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

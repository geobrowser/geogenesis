import { getCachedIdentityToken, setCachedIdentityToken } from '~/core/auth/identity-token';
import { reportEvent } from '~/core/telemetry/logger';

import { onConnectionChange } from './cookie';
import { WALLET_SESSION_RENEW_AFTER_SECONDS } from './wallet-session-lifetime';

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
 * When `syncedAddress` was confirmed. The memo lapses after the session's renewal interval so a tab
 * left open for weeks still asks once a week, which is when the server re-issues the session —
 * otherwise it would expire under a tab that believed it was synced.
 */
let syncedAt = 0;

function isSynced(address: string): boolean {
  return syncedAddress === address && Date.now() - syncedAt < WALLET_SESSION_RENEW_AFTER_SECONDS * 1000;
}

/**
 * Delays before trying again when there was no identity token yet, or the server recognised no
 * wallet. Nothing else re-runs the sync — the smart-account query is keyed on wallet addresses, not
 * the token — so without these an idle tab could stay unrecognised by the server until an
 * unrelated refetch. Spaced past `getCachedIdentityToken`'s 30s cooldown after a failed fetch, and
 * bounded: past the last one, the next smart-account run picks it up as before.
 */
export const SYNC_RETRY_DELAYS_MS = [5_000, 15_000, 35_000, 60_000] as const;

/**
 * Moves on whenever the wallet this tab wants changes: a different address asked for, or the wallet
 * going away. A sync that finishes after that lost the race and must not touch the state of the newer
 * one — otherwise an account switch mid-request could record the previous wallet as synced and cancel
 * the new wallet's pending retry, leaving the tab signed in to the server as the old account. The
 * cookie writes themselves need no such care: Next runs Server Actions one at a time, in order, so
 * the newer request's write always lands last.
 */
let generation = 0;
let requestedAddress: string | null = null;

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
  if (isSynced(address.toLowerCase())) return;

  if (requestedAddress !== address.toLowerCase()) {
    requestedAddress = address.toLowerCase();
    generation += 1;
  }
  const startedIn = generation;
  const superseded = () => startedIn !== generation;

  // No token yet means Privy has not finished signing in. Retry shortly rather than failing the
  // smart-account query over it.
  const identityToken = await getCachedIdentityToken();
  if (superseded()) return;
  if (!identityToken) return scheduleRetry(address);

  const recognised = await onConnectionChange({ type: 'connect', identityToken });
  if (superseded()) return;
  if (recognised?.toLowerCase() === address.toLowerCase()) {
    syncedAddress = recognised.toLowerCase();
    syncedAt = Date.now();
    clearRetry();
    return;
  }
  // A different wallet means the token is not this tab's current account: the identity-token cache
  // is only kept current while a debates or community-call hook is mounted, so after an account
  // switch it can still hold the previous account's token. Drop it so the retry fetches this one.
  // Null is a token that could not be verified (Privy's keys unreachable), which can pass.
  if (recognised !== null) {
    setCachedIdentityToken(null);
    // Reported because the other way to get here would otherwise be silent: the server picks the
    // account's Privy embedded wallet from the token, while `useSmartAccount` picks one from the
    // connected list. They agree while an account holds one embedded wallet, which Privy enforces
    // and Geo has no import path to break; this is what would show it if that ever changed. No
    // addresses — the Sentry user already identifies who.
    reportEvent({
      name: 'wallet-session.mismatch',
      level: 'warning',
      tags: { area: 'wallet-session', outcome: 'server-verified-another-wallet' },
    });
  }
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
  requestedAddress = null;
  generation += 1;
  clearRetry();
}

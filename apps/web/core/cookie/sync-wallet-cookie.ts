import { getCachedIdentityToken, setCachedIdentityToken } from '~/core/auth/identity-token';
import { reportEvent } from '~/core/telemetry/logger';

import { WALLET_SESSION_RENEW_AFTER_SECONDS, WALLET_SESSION_ROUTE } from './wallet-session-lifetime';

type SessionAnswer = { wallet: string | null; status: 'unchanged' | 'renewed' | 'issued' | 'unverified' };

/**
 * The address this tab last had the server recognise, and when. Module scope, so it outlives the
 * smart-account query's refetches and resets with the page: one request per page load, not per
 * refetch. The memo lapses after the renewal interval so a tab left open for weeks still renews
 * its session before it expires.
 */
let syncedAddress: string | null = null;
let syncedAt = 0;

function isSynced(address: string): boolean {
  return syncedAddress === address && Date.now() - syncedAt < WALLET_SESSION_RENEW_AFTER_SECONDS * 1000;
}

/**
 * Re-renders the current page from the server. Registered by `WalletSessionRefresher` with the App
 * Router's `router.refresh`, so this module needs no router of its own.
 */
let refreshPage: (() => void) | null = null;

export function setWalletSessionRefresh(refresh: (() => void) | null) {
  refreshPage = refresh;
}

/**
 * Retry delays for no identity token yet, an unverified token, or a token for another wallet.
 * Nothing else re-runs the sync (the smart-account query is keyed on addresses, not the token), so
 * without these a tab could stay unrecognised by the server. Spaced past `getCachedIdentityToken`'s
 * 30s failure cooldown, and bounded.
 */
export const SYNC_RETRY_DELAYS_MS = [5_000, 15_000, 35_000, 60_000] as const;

/**
 * Bumped whenever the wallet this tab wants changes. A sync that finishes after that lost the race
 * and must not record its wallet or cancel the newer wallet's retry.
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
  retryAddress = address;
  if (retryTimer !== null || retryAttempt >= SYNC_RETRY_DELAYS_MS.length) return;

  retryTimer = setTimeout(() => {
    retryTimer = null;
    const pending = retryAddress;
    if (pending) syncWalletCookie(pending).catch(() => {});
  }, SYNC_RETRY_DELAYS_MS[retryAttempt++]);
}

async function postSession(identityToken: string): Promise<SessionAnswer> {
  const response = await fetch(WALLET_SESSION_ROUTE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${identityToken}` },
    credentials: 'same-origin',
  });
  if (response.status === 401 || response.status === 503) return { wallet: null, status: 'unverified' };
  if (!response.ok) throw new Error(`wallet session request failed: ${response.status}`);
  return (await response.json()) as SessionAnswer;
}

/**
 * Has the server recognise `address` as this tab's wallet. The server takes the wallet from the
 * Privy identity token, never from `address`; `address` only decides whether a call is needed and
 * whether the answer matches.
 *
 * Only `issued` refreshes the page: it means the page was server-rendered signed out. `unchanged`
 * and `renewed` must not, or a signed-in tab would re-render on every visit (#2672).
 */
export async function syncWalletCookie(address: `0x${string}`) {
  const wanted = address.toLowerCase();
  if (isSynced(wanted)) return;

  if (requestedAddress !== wanted) {
    requestedAddress = wanted;
    generation += 1;
  }
  const startedIn = generation;
  const superseded = () => startedIn !== generation;

  const identityToken = await getCachedIdentityToken();
  if (superseded()) return;
  if (!identityToken) return scheduleRetry(address);

  // A failed request retries on the schedule rather than throwing: the smart-account query awaits
  // this, and failing it would make a signed-in user look signed out in the client too.
  let answer: SessionAnswer;
  try {
    answer = await postSession(identityToken);
  } catch {
    if (!superseded()) scheduleRetry(address);
    return;
  }
  if (superseded()) return;

  if (answer.wallet === wanted) {
    syncedAddress = wanted;
    syncedAt = Date.now();
    clearRetry();
    if (answer.status === 'issued') refreshPage?.();
    return;
  }

  // A token for another wallet is a stale cache entry from before an account switch: drop it so the
  // retry fetches the current account's. An unverified token (Privy keys unreachable, or expired)
  // is dropped too, so the retry asks Privy for a fresh one.
  setCachedIdentityToken(null);
  if (answer.wallet !== null) {
    // Today one Privy account holds exactly one embedded wallet, so this should never fire; it is
    // what would show that changing. No addresses: the Sentry user already identifies who.
    reportEvent({
      name: 'wallet-session.mismatch',
      level: 'warning',
      tags: { area: 'wallet-session', outcome: 'server-verified-another-wallet' },
    });
  }
  scheduleRetry(address);
}

/**
 * Call when the wallet goes away, so signing back in with the same one syncs again. The cached
 * identity token belonged to the account that left, so it goes too, but only when this tab had a
 * wallet, so signed-out visitors do not keep resetting a cache the debates hooks share.
 */
export function forgetSyncedWalletCookie() {
  if (syncedAddress !== null || retryAddress !== null) setCachedIdentityToken(null);
  syncedAddress = null;
  requestedAddress = null;
  generation += 1;
  clearRetry();
}

/** Clears the server's session (sign-out). Throws when the server did not confirm it. */
export async function clearWalletSession() {
  forgetSyncedWalletCookie();
  const response = await fetch(WALLET_SESSION_ROUTE, { method: 'DELETE', credentials: 'same-origin' });
  if (!response.ok) throw new Error(`wallet session sign-out failed: ${response.status}`);
}

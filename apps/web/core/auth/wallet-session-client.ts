import { getCachedIdentityToken, setCachedIdentityToken } from '~/core/auth/identity-token';

import { WALLET_SESSION_HINT, WALLET_SESSION_ROUTE } from './wallet-session-shared';

/**
 * The client half of the wallet session, driven by Privy's identity token (`WalletSessionSync`).
 * Module scope, so it lasts for the page: one POST per distinct token, not per render.
 */
let sentToken: string | null = null;
/** The server has no secret. Nothing on this page can fix that, so stop asking. */
let halted = false;
/**
 * The shared token cache is dropped at most once per page. Debates and calls poll it, so dropping it
 * on every rejection would turn a lasting rejection into a Privy `users/me` call per poll.
 */
let droppedCachedToken = false;
/** Bumped by `forgetWalletSession`, so a POST that lands after sign-out is undone. */
let epoch = 0;

/** Retry delays after a retryable failure; Privy's token reissue covers renewal. */
export const SESSION_RETRY_DELAYS_MS = [15_000, 60_000] as const;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryAttempt = 0;

/**
 * A new account's first token can predate its embedded wallet. After `no_wallet`, retry with a fresh
 * token on this schedule, plus once when the wallet appears: at most 4 `users/me` calls per sign-in.
 */
export const NO_WALLET_RETRY_DELAYS_MS = [3_000, 10_000, 30_000] as const;
let noWalletAttempt = 0;
let awaitingWallet = false;
let walletSeen = false;
let walletRetryUsed = false;
/** The token whose POST is in flight, if any. */
let postingToken: string | null = null;

/** A POST for the current token is in flight; resetting `sentToken` now would discard its answer. */
function currentPostInFlight(): boolean {
  return postingToken !== null && postingToken === sentToken;
}

function clearRetry() {
  if (retryTimer !== null) clearTimeout(retryTimer);
  retryTimer = null;
  retryAttempt = 0;
}

function scheduleRetry(refresh: () => void) {
  if (retryTimer !== null || retryAttempt >= SESSION_RETRY_DELAYS_MS.length) return;
  retryTimer = setTimeout(async () => {
    retryTimer = null;
    if (currentPostInFlight()) return;
    sentToken = null;
    const token = await getCachedIdentityToken();
    if (token) await syncWalletSession(token, refresh);
  }, SESSION_RETRY_DELAYS_MS[retryAttempt++]);
}

async function resyncWithFreshToken(refresh: () => void) {
  if (currentPostInFlight()) return;
  const startedIn = epoch;
  setCachedIdentityToken(null);
  sentToken = null;
  const token = await getCachedIdentityToken();
  if (startedIn !== epoch) return;
  if (token) await syncWalletSession(token, refresh);
  else if (awaitingWallet) scheduleNoWalletRetry(refresh);
}

function scheduleNoWalletRetry(refresh: () => void) {
  if (retryTimer !== null || noWalletAttempt >= NO_WALLET_RETRY_DELAYS_MS.length) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void resyncWithFreshToken(refresh);
  }, NO_WALLET_RETRY_DELAYS_MS[noWalletAttempt++]);
}

/** Retries at once, once per sign-in, when the server lacks a wallet the client can already see. */
function retryForWallet(refresh: () => void): boolean {
  if (!awaitingWallet || !walletSeen || walletRetryUsed || halted) return false;
  walletRetryUsed = true;
  clearRetry();
  void resyncWithFreshToken(refresh);
  return true;
}

/** Called when Privy lists the account's embedded wallet. */
export function noteEmbeddedWallet(refresh: () => void) {
  walletSeen = true;
  retryForWallet(refresh);
}

/**
 * Has the server issue or renew the session for the wallet `token` proves. Only `issued` refreshes
 * the page, since that page was rendered signed out; any other refresh would hit every visit.
 */
export async function syncWalletSession(token: string, refresh: () => void): Promise<void> {
  if (halted || token === sentToken) return;
  sentToken = token;
  awaitingWallet = false;
  const startedIn = epoch;

  let response: Response;
  postingToken = token;
  try {
    response = await fetch(WALLET_SESSION_ROUTE, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'same-origin',
    });
  } catch {
    if (sentToken === token) scheduleRetry(refresh);
    return;
  } finally {
    if (postingToken === token) postingToken = null;
  }
  if (startedIn !== epoch) {
    // Signed out while this was in flight, so its Set-Cookie may have overwritten a later DELETE or a
    // newer account's session. Clear it, or re-post the current token unless that POST lands later.
    if (!response.ok) return;
    if (sentToken === null) {
      fetch(WALLET_SESSION_ROUTE, { method: 'DELETE' }).catch(() => {});
    } else if (!currentPostInFlight()) {
      const current = sentToken;
      sentToken = null;
      void syncWalletSession(current, refresh);
    }
    return;
  }
  if (sentToken !== token) return;

  const body = (await response.json().catch(() => null)) as { status?: string } | null;
  if (response.ok) {
    awaitingWallet = false;
    clearRetry();
    if (body?.status === 'issued') refresh();
    return;
  }

  switch (body?.status) {
    case 'unconfigured':
      halted = true;
      clearRetry();
      return;
    case 'no_wallet':
      awaitingWallet = true;
      if (retryForWallet(refresh)) return;
      clearRetry();
      scheduleNoWalletRetry(refresh);
      return;
    case 'invalid_token':
      // So the retry asks Privy for a fresh token.
      if (!droppedCachedToken) {
        droppedCachedToken = true;
        setCachedIdentityToken(null);
      }
      scheduleRetry(refresh);
      return;
    default:
      // `unavailable`, `rate_limited` or an unexpected failure: the same token may work later.
      scheduleRetry(refresh);
  }
}

/** Whether this browser may hold a server session (the readable hint cookie). */
export function hasWalletSessionHint(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split(';').some(part => part.trim().startsWith(`${WALLET_SESSION_HINT}=`));
}

/** Forget what this page sent, so the next sign-in syncs again. */
export function forgetWalletSession() {
  sentToken = null;
  epoch += 1;
  clearRetry();
  noWalletAttempt = 0;
  postingToken = null;
  awaitingWallet = false;
  walletSeen = false;
  walletRetryUsed = false;
}

/** Clears the server's session (sign-out). Throws when the server did not confirm it. */
export async function clearWalletSession() {
  forgetWalletSession();
  const response = await fetch(WALLET_SESSION_ROUTE, { method: 'DELETE', credentials: 'same-origin' });
  if (!response.ok) throw new Error(`wallet session sign-out failed: ${response.status}`);
}

/** Test seam. */
export function resetWalletSessionClientForTests() {
  forgetWalletSession();
  halted = false;
  droppedCachedToken = false;
}

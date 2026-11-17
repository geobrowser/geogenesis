import { getCachedIdentityToken, setCachedIdentityToken } from '~/core/auth/identity-token';

import { WALLET_SESSION_HINT, WALLET_SESSION_ROUTE } from './wallet-session-shared';

/**
 * The client half of the wallet session, driven by Privy's identity token (`WalletSessionSync`).
 * Module scope, so it lasts for the page: one POST per distinct token, not per render.
 */
let sentToken: string | null = null;
/** The server has no secret (503). Nothing on this page can fix that, so stop asking. */
let halted = false;

/** Retry delays after a 401 or a failed request; Privy's token reissue covers renewal. */
export const SESSION_RETRY_DELAYS_MS = [15_000, 60_000] as const;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryAttempt = 0;

function clearRetry() {
  if (retryTimer !== null) clearTimeout(retryTimer);
  retryTimer = null;
  retryAttempt = 0;
}

function scheduleRetry(refresh: () => void) {
  if (retryTimer !== null || retryAttempt >= SESSION_RETRY_DELAYS_MS.length) return;
  retryTimer = setTimeout(async () => {
    retryTimer = null;
    sentToken = null;
    const token = await getCachedIdentityToken();
    if (token) await syncWalletSession(token, refresh);
  }, SESSION_RETRY_DELAYS_MS[retryAttempt++]);
}

/**
 * Has the server issue or renew the session for the wallet `token` proves. Only `issued` refreshes
 * the page, since that page was rendered signed out; any other refresh would hit every visit.
 */
export async function syncWalletSession(token: string, refresh: () => void): Promise<void> {
  if (halted || token === sentToken) return;
  sentToken = token;

  let response: Response;
  try {
    response = await fetch(WALLET_SESSION_ROUTE, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'same-origin',
    });
  } catch {
    if (sentToken === token) scheduleRetry(refresh);
    return;
  }
  if (sentToken !== token) return;

  if (response.status === 503) {
    halted = true;
    clearRetry();
    return;
  }
  if (response.status === 401) {
    // Drop the token from the shared cache so the retry asks Privy for a fresh one.
    setCachedIdentityToken(null);
    scheduleRetry(refresh);
    return;
  }
  if (!response.ok) {
    scheduleRetry(refresh);
    return;
  }

  clearRetry();
  const body = (await response.json().catch(() => null)) as { status?: string } | null;
  if (body?.status === 'issued') refresh();
}

/** Whether this browser may hold a server session (the readable hint cookie). */
export function hasWalletSessionHint(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split(';').some(part => part.trim().startsWith(`${WALLET_SESSION_HINT}=`));
}

/** Forget what this page sent, so the next sign-in syncs again. */
export function forgetWalletSession() {
  sentToken = null;
  clearRetry();
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
}

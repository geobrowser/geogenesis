/**
 * Whether this browser holds a Privy session worth restoring, read without loading Privy.
 *
 * The keys are the ones `@privy-io/react-auth` (3.32.2) itself reads to decide whether it has
 * anything to refresh — `hasRefreshCredentials` in its session-storage class:
 *
 *   - `privy-session` cookie: set to "t" (30 days) when a refresh token is stored.
 *     `mightHaveServerCookies` is true for any non-empty value.
 *   - `privy:refresh_token` in localStorage (JSON-encoded string). The literal "deprecated" is a
 *     sentinel Privy writes in place of a real token; it does not count.
 *   - `privy:token` in localStorage (JSON-encoded string): the access token.
 *
 * Privy itself requires the cookie, or both tokens. This accepts any one of them: a false positive
 * only means Privy loads up front, exactly as it did before this check existed, while a false
 * negative would delay a signed-in reader's session until the idle load. Re-check these names when
 * `@privy-io/react-auth` is upgraded.
 */
export const PRIVY_SESSION_COOKIE = 'privy-session';
export const PRIVY_ACCESS_TOKEN_KEY = 'privy:token';
export const PRIVY_REFRESH_TOKEN_KEY = 'privy:refresh_token';
const DEPRECATED_REFRESH_TOKEN = 'deprecated';

function storedString(key: string): string | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    return typeof value === 'string' && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

/**
 * The access token Privy last stored in this browser, possibly expired, read without loading Privy.
 * Only for calls that accept a recently expired token, like geo-notifications' seen ping.
 */
export function storedPrivyAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return storedString(PRIVY_ACCESS_TOKEN_KEY);
}

function hasSessionCookie(): boolean {
  try {
    return document.cookie.split(';').some(part => {
      const [name, ...value] = part.trim().split('=');
      return name === PRIVY_SESSION_COOKIE && value.join('=').length > 0;
    });
  } catch {
    return false;
  }
}

/** A return from an OAuth redirect has to be completed by Privy on this very load. */
function isReturningFromPrivyRedirect(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    return ['privy_oauth_code', 'privy_oauth_state', 'privy_oauth_provider'].some(key => params.has(key));
  } catch {
    return false;
  }
}

export function hasPersistedPrivySession(): boolean {
  if (typeof window === 'undefined') return false;
  if (hasSessionCookie()) return true;
  const refresh = storedString(PRIVY_REFRESH_TOKEN_KEY);
  if (refresh !== null && refresh !== DEPRECATED_REFRESH_TOKEN) return true;
  if (storedString(PRIVY_ACCESS_TOKEN_KEY) !== null) return true;
  return isReturningFromPrivyRedirect();
}

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  PRIVY_ACCESS_TOKEN_KEY,
  PRIVY_REFRESH_TOKEN_KEY,
  PRIVY_SESSION_COOKIE,
  hasPersistedPrivySession,
} from './privy-session';

function clearCookie() {
  document.cookie = `${PRIVY_SESSION_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

beforeEach(() => {
  localStorage.clear();
  clearCookie();
  window.history.replaceState({}, '', '/explore');
});
afterEach(() => {
  localStorage.clear();
  clearCookie();
  window.history.replaceState({}, '', '/');
});

// The keys are the ones @privy-io/react-auth 3.32.2 reads in `hasRefreshCredentials`; Privy writes
// localStorage values JSON-encoded.
describe('hasPersistedPrivySession', () => {
  it('is false for a visitor Privy has never seen', () => {
    expect(hasPersistedPrivySession()).toBe(false);
  });

  it('is true while the privy-session cookie Privy sets with a refresh token is present', () => {
    document.cookie = `${PRIVY_SESSION_COOKIE}=t; path=/`;
    expect(hasPersistedPrivySession()).toBe(true);
  });

  it('is true for a stored refresh token', () => {
    localStorage.setItem(PRIVY_REFRESH_TOKEN_KEY, JSON.stringify('refresh-token'));
    expect(hasPersistedPrivySession()).toBe(true);
  });

  it('is true for a stored access token', () => {
    localStorage.setItem(PRIVY_ACCESS_TOKEN_KEY, JSON.stringify('access-token'));
    expect(hasPersistedPrivySession()).toBe(true);
  });

  it('does not count the "deprecated" refresh token sentinel', () => {
    localStorage.setItem(PRIVY_REFRESH_TOKEN_KEY, JSON.stringify('deprecated'));
    expect(hasPersistedPrivySession()).toBe(false);
  });

  it('ignores values that are not strings', () => {
    localStorage.setItem(PRIVY_REFRESH_TOKEN_KEY, 'not json');
    localStorage.setItem(PRIVY_ACCESS_TOKEN_KEY, JSON.stringify(null));
    expect(hasPersistedPrivySession()).toBe(false);
  });

  it('is true on the return from an OAuth redirect, which Privy has to finish on this load', () => {
    window.history.replaceState({}, '', '/explore?privy_oauth_code=c&privy_oauth_state=s');
    expect(hasPersistedPrivySession()).toBe(true);
  });
});

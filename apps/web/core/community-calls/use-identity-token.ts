'use client';

import { getIdentityToken, useIdentityToken, usePrivy } from '@geogenesis/auth';

import * as React from 'react';

/**
 * The current user's Privy identity token (JWT). curator-backend verifies this
 * directly — geogenesis and curator share a Privy project, so it's passed
 * straight through as `Authorization: Bearer <token>` with no auth shim.
 *
 * - `identityToken` is reactive — use it to gate the signed-in UI.
 * - `getToken()` returns a FRESH token for the actual request. The cached
 *   identity token expires (~1h) and goes stale on long-open tabs, which
 *   curator-backend rejects with a 401 ("Authentication token expired").
 *   `getAccessToken()` refreshes the Privy session — reissuing the identity
 *   token — so we read a current one back instead of sending the stale value.
 *
 * `getToken` is referentially stable, hence the refs. Callers hold it in effect
 * dependency arrays and poll with it (see `usePersistentChat`), so binding the
 * callback to `identityToken` would restart those effects on every refresh.
 */
export function useCommunityCallIdentityToken() {
  const { identityToken } = useIdentityToken();
  const { getAccessToken } = usePrivy();

  const getAccessTokenRef = React.useRef(getAccessToken);
  const identityTokenRef = React.useRef(identityToken);

  React.useEffect(() => {
    getAccessTokenRef.current = getAccessToken;
    identityTokenRef.current = identityToken;
  }, [getAccessToken, identityToken]);

  const getToken = React.useCallback(async (): Promise<string | null> => {
    await getAccessTokenRef.current().catch(() => null);
    return getIdentityToken().catch(() => identityTokenRef.current);
  }, []);

  return { identityToken, getToken };
}

'use client';

import { getCachedIdentityToken, useIdentityTokenSync } from '~/core/auth/identity-token';

/**
 * The current user's Privy identity token (JWT). curator-backend verifies it directly:
 * geogenesis and curator share a Privy project, so it's passed straight through as
 * `Authorization: Bearer <token>` with no auth shim.
 *
 * `identityToken` is reactive, for gating the signed-in UI. `getToken` reads the shared
 * cache (see `~/core/auth/identity-token`) and is referentially stable, which matters
 * because callers hold it in effect dependency arrays and poll with it (see
 * `usePersistentChat`).
 */
export function useCommunityCallIdentityToken() {
  const identityToken = useIdentityTokenSync();

  return { identityToken, getToken: getCachedIdentityToken };
}

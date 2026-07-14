'use client';

import { getIdentityToken, useIdentityToken } from '@geogenesis/auth';

import * as React from 'react';

/**
 * Cached access to the current user's Privy identity token (JWT).
 *
 * Privy's `getIdentityToken()` is not a local read. On every call it awaits
 * `updateUserAndIdToken()`, a `GET /api/v1/users/me` round-trip. Debates and community
 * calls poll on 1-5s intervals and build each request's `Authorization` header from this
 * token, so calling it per request got us rate limited by Privy (`too_many_requests`).
 *
 * Refreshing as the token nears expiry still keeps long-open tabs from sending an expired
 * one, which the backends reject with a 401.
 */

const EXPIRY_SKEW_MS = 60_000;

// Privy issues JWTs, so `exp` normally parses. This only bounds the refresh rate for a
// token we can't read an expiry from.
const FALLBACK_TTL_MS = 5 * 60_000;

// A failed refresh leaves the cache stale, so without a cooldown the next poll retries
// immediately and the storm sustains itself. Same for a signed-out user, who has no token
// to fetch but would be asked for one on every poll.
const FAILURE_COOLDOWN_MS = 30_000;

type CachedToken = {
  token: string;
  expiresAt: number;
};

let cached: CachedToken | null = null;
let inFlight: Promise<string | null> | null = null;
let refreshBlockedUntil = 0;

function expiresAtFrom(token: string): number {
  const fallback = Date.now() + FALLBACK_TTL_MS;
  const payload = token.split('.')[1];

  if (!payload) return fallback;

  try {
    const { exp } = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof exp === 'number' ? exp * 1000 : fallback;
  } catch {
    return fallback;
  }
}

function isUsable(entry: CachedToken | null): entry is CachedToken {
  return entry !== null && Date.now() < entry.expiresAt - EXPIRY_SKEW_MS;
}

export function setCachedIdentityToken(token: string | null) {
  cached = token === null ? null : { token, expiresAt: expiresAtFrom(token) };
  refreshBlockedUntil = 0;
}

export async function getCachedIdentityToken(): Promise<string | null> {
  if (isUsable(cached)) return cached.token;
  if (Date.now() < refreshBlockedUntil) return cached?.token ?? null;

  inFlight ??= getIdentityToken()
    .then(token => {
      setCachedIdentityToken(token);
      if (token === null) refreshBlockedUntil = Date.now() + FAILURE_COOLDOWN_MS;
      return token;
    })
    .catch(() => {
      refreshBlockedUntil = Date.now() + FAILURE_COOLDOWN_MS;
      // Fall back to the last token we held, past due or not. The backend decides expiry.
      return cached?.token ?? null;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/**
 * Privy reissues the identity token reactively, so priming the cache from it costs nothing
 * and spares us the opening `users/me`. Clearing it on logout stops us sending a signed-out
 * user's token.
 */
export function useIdentityTokenSync() {
  const { identityToken } = useIdentityToken();

  React.useEffect(() => {
    setCachedIdentityToken(identityToken);
  }, [identityToken]);

  return identityToken;
}

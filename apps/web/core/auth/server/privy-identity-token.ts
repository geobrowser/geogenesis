/**
 * Server-side verification of a Privy identity token, so a route can know WHO is asking.
 *
 * Used per request by For you and the ranking lab, and by `POST /api/wallet-session`, which issues
 * the signed session every other server read trusts (`./wallet-session`). The browser sends the
 * identity token it already holds (`getCachedIdentityToken`), and this checks it the way geo-chat does
 * (crates/auth/src/privy.rs): ES256 against Privy's published keys, issuer `privy.io`, audience
 * this app's Privy id, not expired. The user's Geo account is the embedded Ethereum wallet in its
 * `linked_accounts` claim.
 *
 * WebCrypto only, no dependency: an ES256 JWS signature is the raw r||s pair WebCrypto expects.
 */

const JWKS_TTL_MS = 60 * 60 * 1000;
const JWKS_FETCH_TIMEOUT_MS = 2_000;
/** An unknown kid refetches keys at most this often, so forged kids cannot make every request call Privy. */
const JWKS_FORCED_REFRESH_MIN_MS = 60_000;
/** Accepted clock skew, in seconds, on exp / nbf / iat. */
const CLOCK_SKEW_S = 30;

type Jwk = JsonWebKey & { kid?: string; alg?: string };

let jwksCache: { appId: string; keys: Jwk[]; fetchedAt: number } | null = null;

export function privyJwksUrl(appId: string): string {
  return `https://auth.privy.io/api/v1/apps/${encodeURIComponent(appId)}/jwks.json`;
}

async function fetchJwks(appId: string, fetcher: typeof fetch): Promise<Jwk[]> {
  const response = await fetcher(privyJwksUrl(appId), {
    signal: AbortSignal.timeout(JWKS_FETCH_TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Privy JWKS fetch failed: ${response.status}`);
  const body = (await response.json()) as { keys?: Jwk[] };
  return Array.isArray(body.keys) ? body.keys : [];
}

/** The keys, and whether this call fetched them (false when served from cache). */
async function keysFor(
  appId: string,
  fetcher: typeof fetch,
  forceRefresh: boolean,
  now: number
): Promise<{ keys: Jwk[]; fetched: boolean }> {
  const age = jwksCache && jwksCache.appId === appId ? now - jwksCache.fetchedAt : Infinity;
  if (jwksCache && age < (forceRefresh ? JWKS_FORCED_REFRESH_MIN_MS : JWKS_TTL_MS)) {
    return { keys: jwksCache.keys, fetched: false };
  }
  const keys = await fetchJwks(appId, fetcher);
  jwksCache = { appId, keys, fetchedAt: now };
  return { keys, fetched: true };
}

/** Test seam. */
export function resetPrivyJwksCacheForTests() {
  jwksCache = null;
}

function base64UrlDecode(segment: string): Uint8Array<ArrayBuffer> {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJson(segment: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlDecode(segment)));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export type PrivyIdentity = {
  /** Privy user id (`sub`). */
  userId: string;
  /** The embedded Ethereum wallet, lowercased: the address a Geo personal space belongs to. */
  walletAddress: string | null;
};

type LinkedAccount = { type?: unknown; address?: unknown; chain_type?: unknown; wallet_client_type?: unknown };

/** The Privy-embedded Ethereum wallet, as geo-chat's `embedded_ethereum_wallet` picks it. */
export function embeddedEthereumWallet(linkedAccountsClaim: unknown): string | null {
  let accounts: unknown = linkedAccountsClaim;
  if (typeof accounts === 'string') {
    try {
      accounts = JSON.parse(accounts);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(accounts)) return null;
  for (const account of accounts as LinkedAccount[]) {
    if (
      account?.type === 'wallet' &&
      account.wallet_client_type === 'privy' &&
      account.chain_type === 'ethereum' &&
      typeof account.address === 'string' &&
      /^0x[0-9a-fA-F]{40}$/.test(account.address)
    ) {
      return account.address.toLowerCase();
    }
  }
  return null;
}

/**
 * Why a token did not verify: `invalid` for the token itself, `unavailable` when Privy's keys could
 * not be fetched, so the same token may verify later.
 */
export type PrivyVerification =
  { ok: true; identity: PrivyIdentity } | { ok: false; reason: 'invalid' | 'unavailable' };

const INVALID = { ok: false, reason: 'invalid' } as const;

/** `verifyPrivyIdentityToken`, telling a bad token apart from a key-fetch outage. */
export async function verifyPrivyIdentityTokenDetailed(
  token: string | null | undefined,
  options: { appId: string; fetcher?: typeof fetch; now?: () => number }
): Promise<PrivyVerification> {
  if (!token || !options.appId) return INVALID;
  const parts = token.trim().split('.');
  if (parts.length !== 3) return INVALID;
  const [headerSegment, payloadSegment, signatureSegment] = parts as [string, string, string];

  const header = decodeJson(headerSegment);
  const payload = decodeJson(payloadSegment);
  if (!header || !payload || header.alg !== 'ES256') return INVALID;

  const nowMs = options.now?.() ?? Date.now();
  const nowS = Math.floor(nowMs / 1000);
  const aud = payload.aud;
  const audiences = Array.isArray(aud) ? aud : [aud];
  if (payload.iss !== 'privy.io' || !audiences.includes(options.appId)) return INVALID;
  if (typeof payload.exp !== 'number' || payload.exp + CLOCK_SKEW_S < nowS) return INVALID;
  if (typeof payload.nbf === 'number' && payload.nbf - CLOCK_SKEW_S > nowS) return INVALID;
  if (typeof payload.iat === 'number' && payload.iat - CLOCK_SKEW_S > nowS) return INVALID;
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) return INVALID;

  const fetcher = options.fetcher ?? fetch;
  const kid = typeof header.kid === 'string' ? header.kid : null;
  let signature: Uint8Array<ArrayBuffer>;
  try {
    signature = base64UrlDecode(signatureSegment);
  } catch {
    return INVALID;
  }
  const signed = new TextEncoder().encode(`${headerSegment}.${payloadSegment}`);

  const pick = (keys: Jwk[]) => (kid ? keys.find(k => k.kid === kid) : keys[0]) ?? null;

  let jwk: Jwk | null;
  try {
    const cached = await keysFor(options.appId, fetcher, false, nowMs);
    jwk = pick(cached.keys);
    if (!jwk && !cached.fetched) {
      // An unknown kid means Privy may have rotated keys: refetch once, rate-limited. When the cap
      // stops the refetch the token could not be checked, which is not the same as it being bad.
      const refreshed = await keysFor(options.appId, fetcher, true, nowMs);
      if (!refreshed.fetched) return { ok: false, reason: 'unavailable' };
      jwk = pick(refreshed.keys);
    }
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  if (!jwk) return INVALID;

  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, ext: true },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
    if (!(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, signed))) return INVALID;
  } catch {
    return INVALID;
  }

  return {
    ok: true,
    identity: { userId: payload.sub, walletAddress: embeddedEthereumWallet(payload.linked_accounts) },
  };
}

/**
 * The verified identity behind `token`, or null for anything that does not verify. Never throws
 * for a bad token; a JWKS outage also yields null, so a caller falls back to the signed-out path.
 */
export async function verifyPrivyIdentityToken(
  token: string | null | undefined,
  options: { appId: string; fetcher?: typeof fetch; now?: () => number }
): Promise<PrivyIdentity | null> {
  const result = await verifyPrivyIdentityTokenDetailed(token, options);
  return result.ok ? result.identity : null;
}

/** The bearer token from an Authorization header, if any. */
export function bearerToken(authorization: string | null | undefined): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match ? match[1]!.trim() : null;
}

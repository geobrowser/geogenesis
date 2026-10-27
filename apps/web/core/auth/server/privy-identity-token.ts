/**
 * Server-side verification of a Privy identity token, so a route can know WHO is asking.
 *
 * Until now no route in this app verified anything: the wallet cookie (`WALLET_ADDRESS`) is set by
 * the client and only ever used for public reads, where trusting it costs nothing. For you reads a
 * person's private interest profile, so it cannot trust a cookie anyone can write. The browser
 * sends the identity token it already holds (`getCachedIdentityToken`, the same one debates and
 * community calls send to their backends), and this checks it the way geo-chat does
 * (crates/auth/src/privy.rs): ES256 against Privy's published keys, issuer `privy.io`, audience
 * this app's Privy id, not expired. The user's Geo account is the embedded Ethereum wallet in its
 * `linked_accounts` claim.
 *
 * WebCrypto only, no dependency: an ES256 JWS signature is the raw r||s pair WebCrypto expects.
 */

const JWKS_TTL_MS = 60 * 60 * 1000;
const JWKS_FETCH_TIMEOUT_MS = 2_000;
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

async function keysFor(appId: string, fetcher: typeof fetch, forceRefresh: boolean): Promise<Jwk[]> {
  const now = Date.now();
  if (!forceRefresh && jwksCache && jwksCache.appId === appId && now - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  const keys = await fetchJwks(appId, fetcher);
  jwksCache = { appId, keys, fetchedAt: now };
  return keys;
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
 * The verified identity behind `token`, or null for anything that does not verify. Never throws
 * for a bad token; a JWKS outage also yields null, so a caller falls back to the signed-out path.
 */
export async function verifyPrivyIdentityToken(
  token: string | null | undefined,
  options: { appId: string; fetcher?: typeof fetch; now?: () => number }
): Promise<PrivyIdentity | null> {
  if (!token || !options.appId) return null;
  const parts = token.trim().split('.');
  if (parts.length !== 3) return null;
  const [headerSegment, payloadSegment, signatureSegment] = parts as [string, string, string];

  const header = decodeJson(headerSegment);
  const payload = decodeJson(payloadSegment);
  if (!header || !payload || header.alg !== 'ES256') return null;

  const nowS = Math.floor((options.now?.() ?? Date.now()) / 1000);
  const aud = payload.aud;
  const audiences = Array.isArray(aud) ? aud : [aud];
  if (payload.iss !== 'privy.io' || !audiences.includes(options.appId)) return null;
  if (typeof payload.exp !== 'number' || payload.exp + CLOCK_SKEW_S < nowS) return null;
  if (typeof payload.nbf === 'number' && payload.nbf - CLOCK_SKEW_S > nowS) return null;
  if (typeof payload.iat === 'number' && payload.iat - CLOCK_SKEW_S > nowS) return null;
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null;

  const fetcher = options.fetcher ?? fetch;
  const kid = typeof header.kid === 'string' ? header.kid : null;
  let signature: Uint8Array<ArrayBuffer>;
  try {
    signature = base64UrlDecode(signatureSegment);
  } catch {
    return null;
  }
  const signed = new TextEncoder().encode(`${headerSegment}.${payloadSegment}`);

  const verifyWith = async (forceRefresh: boolean): Promise<boolean | null> => {
    const keys = await keysFor(options.appId, fetcher, forceRefresh);
    const jwk = kid ? keys.find(k => k.kid === kid) : keys[0];
    if (!jwk) return null;
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, ext: true },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
    return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, signed);
  };

  try {
    // An unknown kid means Privy rotated keys since the cache was filled: refetch once.
    let valid = await verifyWith(false);
    if (valid === null) valid = await verifyWith(true);
    if (!valid) return null;
  } catch {
    return null;
  }

  return { userId: payload.sub, walletAddress: embeddedEthereumWallet(payload.linked_accounts) };
}

/** The bearer token from an Authorization header, if any. */
export function bearerToken(authorization: string | null | undefined): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match ? match[1]!.trim() : null;
}

import { createHmac, timingSafeEqual } from 'node:crypto';
import { getAddress, isAddress } from 'viem';

/**
 * The signed-in wallet the server trusts, carried in the `walletSession` cookie as
 * `<address>.<issuedAtSeconds>.<signature>`.
 *
 * The signature is an HMAC over the address and issue time, keyed by `WALLET_SESSION_SECRET`,
 * and the cookie is only ever issued by `onConnectionChange` after it has verified a Privy
 * identity token for that wallet. A cookie someone wrote by hand fails the signature and reads
 * as signed out — which is the point: the previous `walletAddress` cookie held a bare address
 * that anyone could set to anything (GEO-3107).
 *
 * Without the secret nothing verifies, so every request reads as signed out. That fails closed
 * rather than falling back to trusting an unsigned value.
 */

export const WALLET_SESSION = 'walletSession';

/** Browsers cap cookie lifetime at 400 days, so a session can never outlive this anyway. */
export const WALLET_SESSION_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

type CookieReader = { get(name: string): { value: string } | undefined };

let warnedMissingSecret = false;

function secret(): string | null {
  const value = process.env.WALLET_SESSION_SECRET;
  if (value) return value;
  if (!warnedMissingSecret) {
    warnedMissingSecret = true;
    console.error('[wallet-session] WALLET_SESSION_SECRET is not set; every request will read as signed out.');
  }
  return null;
}

function sign(key: string, payload: string): Buffer {
  return createHmac('sha256', key).update(payload).digest();
}

/** The cookie value for `address`, or null when the server has no secret to sign with. */
export function signWalletSession(address: string, now = Date.now()): string | null {
  const key = secret();
  if (!key || !isAddress(address)) return null;
  const payload = `${getAddress(address)}.${Math.floor(now / 1000)}`;
  return `${payload}.${sign(key, payload).toString('base64url')}`;
}

/** The checksummed address a cookie value vouches for, or null if it is forged, malformed or expired. */
export function verifyWalletSession(value: string | undefined, now = Date.now()): `0x${string}` | null {
  if (!value) return null;
  const key = secret();
  if (!key) return null;

  const [address, issuedAt, signature, ...rest] = value.split('.');
  if (rest.length > 0 || !address || !issuedAt || !signature) return null;
  if (!isAddress(address) || address !== getAddress(address)) return null;

  const issuedAtSeconds = Number(issuedAt);
  if (!Number.isSafeInteger(issuedAtSeconds)) return null;
  const ageSeconds = now / 1000 - issuedAtSeconds;
  // A little tolerance for clock skew between server instances.
  if (ageSeconds < -300 || ageSeconds > WALLET_SESSION_MAX_AGE_SECONDS) return null;

  const expected = sign(key, `${address}.${issuedAt}`);
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  return address;
}

/**
 * The signed-in wallet for this request, or undefined when there is none the server can trust.
 * Every server read of the wallet cookie goes through here.
 */
export function readWalletCookie(cookieStore: CookieReader): `0x${string}` | undefined {
  return verifyWalletSession(cookieStore.get(WALLET_SESSION)?.value) ?? undefined;
}

/**
 * The same wallet lowercased, or null. Rate limits and membership checks key on this form, so a
 * checksummed and a lowercased address never count as two identities.
 */
export function readWalletCookieLowercase(cookieStore: CookieReader): string | null {
  return readWalletCookie(cookieStore)?.toLowerCase() ?? null;
}

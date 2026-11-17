import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getAddress, isAddress } from 'viem';

import { reportError } from '~/core/telemetry/logger';

import { WALLET_SESSION_MAX_AGE_SECONDS, WALLET_SESSION_RENEW_AFTER_SECONDS } from '../wallet-session-shared';

/**
 * `v1.<address>.<issuedAtSeconds>.<HMAC-SHA256>` keyed by `WALLET_SESSION_SECRET`, issued after a
 * Privy login check. A bad MAC, or a missing secret, reads as signed out.
 */
export const WALLET_SESSION = 'walletSession';

/** The unsigned cookie this replaced. Anyone could set it, so it is never read, only deleted. */
export const LEGACY_WALLET_ADDRESS = 'walletAddress';

const VERSION = 'v1';
/** Tolerated clock skew between server instances on `issuedAt`. */
const FUTURE_SKEW_SECONDS = 300;
/** Local dev only: lets SSR recognise the signed-in user without configuring a secret. */
const DEV_SECRET = 'geo-dev-wallet-session-secret-not-for-production';

export const WALLET_SESSION_COOKIE_OPTIONS = {
  maxAge: WALLET_SESSION_MAX_AGE_SECONDS,
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
} as const;

type CookieReader = { get(name: string): { value: string } | undefined };

let reportedMissingSecret = false;

/** Reports a missing production secret to Sentry, once per server instance. */
export function reportMissingWalletSessionSecret() {
  if (reportedMissingSecret) return;
  reportedMissingSecret = true;
  const error = new Error('WALLET_SESSION_SECRET is not set; every request reads as signed out');
  console.error(`[wallet-session] ${error.message}`);
  reportError(error, { tags: { area: 'wallet-session' } });
}

function secret(): string | null {
  const value = process.env.WALLET_SESSION_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV !== 'production') return DEV_SECRET;
  reportMissingWalletSessionSecret();
  return null;
}

/** Test seam. */
export function resetWalletSessionWarningForTests() {
  reportedMissingSecret = false;
}

function mac(key: string, payload: string): Buffer {
  return createHmac('sha256', key).update(payload).digest();
}

function macMatches(key: string, payload: string, signature: string): boolean {
  const expected = mac(key, payload);
  const actual = Buffer.from(signature, 'base64url');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** The cookie value for `address`, or null when there is no secret to sign with. */
export function signWalletSession(address: string, now = Date.now()): string | null {
  const key = secret();
  if (!key || !isAddress(address, { strict: false })) return null;
  const payload = `${VERSION}.${getAddress(address)}.${Math.floor(now / 1000)}`;
  return `${payload}.${mac(key, payload).toString('base64url')}`;
}

export type VerifiedWalletSession = { address: `0x${string}`; renewalDue: boolean };

/**
 * The session a cookie value vouches for, or null when it is forged, malformed or expired. A value
 * signed with `WALLET_SESSION_SECRET_PREVIOUS` verifies but is due for renewal, so it is re-signed
 * with the current secret on the next sync.
 */
export function verifyWalletSession(value: string | undefined, now = Date.now()): VerifiedWalletSession | null {
  if (!value) return null;
  const key = secret();
  if (!key) return null;

  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const [version, address, issuedAt, signature] = parts as [string, string, string, string];
  if (version !== VERSION || !isAddress(address) || address !== getAddress(address)) return null;
  if (!/^\d+$/.test(issuedAt)) return null;

  const ageSeconds = now / 1000 - Number(issuedAt);
  if (ageSeconds < -FUTURE_SKEW_SECONDS || ageSeconds > WALLET_SESSION_MAX_AGE_SECONDS) return null;

  const payload = `${version}.${address}.${issuedAt}`;
  if (macMatches(key, payload, signature)) {
    return { address, renewalDue: ageSeconds > WALLET_SESSION_RENEW_AFTER_SECONDS };
  }
  const previous = process.env.WALLET_SESSION_SECRET_PREVIOUS;
  if (previous && macMatches(previous, payload, signature)) return { address, renewalDue: true };
  return null;
}

/** The verified session in `cookieStore`, for the code that issues sessions. */
export function readWalletSessionFrom(cookieStore: CookieReader, now = Date.now()): VerifiedWalletSession | null {
  return verifyWalletSession(cookieStore.get(WALLET_SESSION)?.value, now);
}

/**
 * The signed-in wallet for this request (checksummed), or null when there is none the server can
 * trust. Every server read of who is signed in goes through here or `readWalletSessionLowercase`.
 */
export async function readWalletSession(): Promise<`0x${string}` | null> {
  return readWalletSessionFrom(await cookies())?.address ?? null;
}

/** The same wallet lowercased. Rate limits and membership checks key on this form. */
export async function readWalletSessionLowercase(): Promise<string | null> {
  return (await readWalletSession())?.toLowerCase() ?? null;
}

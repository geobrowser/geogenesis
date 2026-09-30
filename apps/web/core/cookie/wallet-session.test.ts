// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  WALLET_SESSION,
  WALLET_SESSION_MAX_AGE_SECONDS,
  readWalletCookie,
  readWalletCookieLowercase,
  signWalletSession,
  verifyWalletSession,
} from './wallet-session';

const ADDRESS = '0xA0Cf798816D4b9b9866b5330EEa46a18382f251e';
const OTHER = '0x5B38Da6a701c568545dCfcB03FcB875f56beddC4';
const NOW = Date.UTC(2026, 8, 30);

function storeWith(value: string | undefined) {
  return { get: (name: string) => (name === WALLET_SESSION && value !== undefined ? { value } : undefined) };
}

describe('wallet session cookie', () => {
  beforeEach(() => {
    vi.stubEnv('WALLET_SESSION_SECRET', 'test-secret');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('round-trips an address the server signed', () => {
    const session = signWalletSession(ADDRESS, NOW)!;

    expect(verifyWalletSession(session, NOW)).toBe(ADDRESS);
    expect(readWalletCookie(storeWith(session))).toBe(ADDRESS);
  });

  it('checksums the address it signs, so a lowercased input verifies as the same wallet', () => {
    expect(verifyWalletSession(signWalletSession(ADDRESS.toLowerCase(), NOW)!, NOW)).toBe(ADDRESS);
  });

  // The hole GEO-3107 closes: the old cookie was a bare address anyone could write.
  it('rejects a bare address, which is what the old cookie held', () => {
    expect(verifyWalletSession(ADDRESS, NOW)).toBeNull();
    expect(readWalletCookie(storeWith(ADDRESS))).toBeUndefined();
  });

  it('rejects a signed session whose address was swapped for another wallet', () => {
    const [, issuedAt, signature] = signWalletSession(ADDRESS, NOW)!.split('.');

    expect(verifyWalletSession(`${OTHER}.${issuedAt}.${signature}`, NOW)).toBeNull();
  });

  it('rejects a session whose issue time was changed', () => {
    const [address, issuedAt, signature] = signWalletSession(ADDRESS, NOW)!.split('.');

    expect(verifyWalletSession(`${address}.${Number(issuedAt) + 1}.${signature}`, NOW)).toBeNull();
  });

  it('rejects a session signed with a different secret', () => {
    vi.stubEnv('WALLET_SESSION_SECRET', 'someone-else');
    const forged = signWalletSession(ADDRESS, NOW)!;
    vi.stubEnv('WALLET_SESSION_SECRET', 'test-secret');

    expect(verifyWalletSession(forged, NOW)).toBeNull();
  });

  it('rejects a session older than the cookie lifetime', () => {
    const session = signWalletSession(ADDRESS, NOW)!;
    const later = NOW + (WALLET_SESSION_MAX_AGE_SECONDS + 60) * 1000;

    expect(verifyWalletSession(session, later)).toBeNull();
  });

  it('rejects malformed values', () => {
    const session = signWalletSession(ADDRESS, NOW)!;

    for (const value of ['', '...', `${session}.extra`, session.replace(/\.[^.]+$/, '.'), 'not-a-session']) {
      expect(verifyWalletSession(value, NOW)).toBeNull();
    }
  });

  it('fails closed without a secret: nothing is signed and nothing verifies', () => {
    const session = signWalletSession(ADDRESS, NOW)!;
    vi.stubEnv('WALLET_SESSION_SECRET', '');

    expect(signWalletSession(ADDRESS, NOW)).toBeNull();
    expect(verifyWalletSession(session, NOW)).toBeNull();
  });

  it('gives rate limits and membership checks the lowercased wallet, or null', () => {
    expect(readWalletCookieLowercase(storeWith(signWalletSession(ADDRESS)!))).toBe(ADDRESS.toLowerCase());
    expect(readWalletCookieLowercase(storeWith(ADDRESS))).toBeNull();
    expect(readWalletCookieLowercase(storeWith(undefined))).toBeNull();
  });
});

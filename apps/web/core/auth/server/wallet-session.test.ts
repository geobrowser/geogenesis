import { createHmac } from 'node:crypto';
import { getAddress } from 'viem';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WALLET_SESSION_MAX_AGE_SECONDS, WALLET_SESSION_RENEW_AFTER_SECONDS } from '../wallet-session-shared';
import {
  LEGACY_WALLET_ADDRESS,
  WALLET_SESSION,
  readWalletSession,
  readWalletSessionLowercase,
  resetWalletSessionWarningForTests,
  signWalletSession,
  verifyWalletSession,
} from './wallet-session';

const jar = vi.hoisted(() => new Map<string, string>());
const reportError = vi.hoisted(() => vi.fn());
vi.mock('~/core/telemetry/logger', () => ({ reportError }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined) }),
}));

const SECRET = 'test-secret';
const LOWER = '0xabcdef0123456789abcdef0123456789abcdef01';
const CHECKSUMMED = getAddress(LOWER);
const OTHER = '0x2222222222222222222222222222222222222222';
const NOW = 1_800_000_000_000;

function forge(payload: string, key: string) {
  return `${payload}.${createHmac('sha256', key).update(payload).digest('base64url')}`;
}

beforeEach(() => {
  jar.clear();
  vi.stubEnv('WALLET_SESSION_SECRET', SECRET);
  resetWalletSessionWarningForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('wallet session', () => {
  it('round-trips a wallet, checksummed', () => {
    const value = signWalletSession(LOWER, NOW)!;
    expect(verifyWalletSession(value, NOW)).toEqual({ address: CHECKSUMMED, renewalDue: false });
  });

  it('rejects a changed address, issue time or MAC', () => {
    const value = signWalletSession(LOWER, NOW)!;
    const [version, , issuedAt, mac] = value.split('.');
    expect(verifyWalletSession([version, OTHER, issuedAt, mac].join('.'), NOW)).toBeNull();
    expect(verifyWalletSession([version, CHECKSUMMED, String(Number(issuedAt) + 1), mac].join('.'), NOW)).toBeNull();
    expect(verifyWalletSession([version, CHECKSUMMED, issuedAt, 'AAAA'].join('.'), NOW)).toBeNull();
  });

  it('rejects a bare address and a value signed with another secret', () => {
    expect(verifyWalletSession(LOWER, NOW)).toBeNull();
    expect(verifyWalletSession(forge(`v1.${CHECKSUMMED}.${NOW / 1000}`, 'guessed'), NOW)).toBeNull();
  });

  it('expires after the max age and is due for renewal after the renewal age', () => {
    const value = signWalletSession(LOWER, NOW)!;
    const renewAt = NOW + (WALLET_SESSION_RENEW_AFTER_SECONDS + 1) * 1000;
    expect(verifyWalletSession(value, renewAt)?.renewalDue).toBe(true);
    expect(verifyWalletSession(value, NOW + (WALLET_SESSION_MAX_AGE_SECONDS + 1) * 1000)).toBeNull();
  });

  it('fails closed in production without a secret, and reports it to Sentry once', () => {
    const value = signWalletSession(LOWER, NOW)!;
    vi.stubEnv('WALLET_SESSION_SECRET', '');
    vi.stubEnv('NODE_ENV', 'production');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    reportError.mockClear();
    expect(verifyWalletSession(value, NOW)).toBeNull();
    expect(signWalletSession(LOWER, NOW)).toBeNull();
    expect(reportError).toHaveBeenCalledOnce();
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), { tags: { area: 'wallet-session' } });
    error.mockRestore();
  });

  it('accepts a session signed with the previous secret, due for renewal', () => {
    vi.stubEnv('WALLET_SESSION_SECRET', 'old-secret');
    const value = signWalletSession(LOWER, NOW)!;
    vi.stubEnv('WALLET_SESSION_SECRET', SECRET);
    expect(verifyWalletSession(value, NOW)).toBeNull();

    vi.stubEnv('WALLET_SESSION_SECRET_PREVIOUS', 'old-secret');
    expect(verifyWalletSession(value, NOW)).toEqual({ address: CHECKSUMMED, renewalDue: true });
  });

  it('reads the request session and ignores the legacy cookie', async () => {
    jar.set(LEGACY_WALLET_ADDRESS, LOWER);
    expect(await readWalletSession()).toBeNull();

    jar.set(WALLET_SESSION, signWalletSession(LOWER)!);
    expect(await readWalletSession()).toBe(CHECKSUMMED);
    expect(await readWalletSessionLowercase()).toBe(LOWER);
  });

  it('reads a hand-made session as signed out', async () => {
    jar.set(WALLET_SESSION, `v1.${CHECKSUMMED}.${Math.floor(Date.now() / 1000)}.forged`);
    expect(await readWalletSession()).toBeNull();
  });
});

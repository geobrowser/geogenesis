import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  LEGACY_WALLET_ADDRESS,
  WALLET_SESSION,
  readWalletSessionFrom,
  signWalletSession,
} from '~/core/cookie/wallet-session';
import { WALLET_SESSION_RENEW_AFTER_SECONDS } from '~/core/cookie/wallet-session-lifetime';

const mocks = vi.hoisted(() => {
  const values = new Map<string, string>();
  return {
    values,
    store: {
      get: (name: string) => (values.has(name) ? { name, value: values.get(name)! } : undefined),
      has: (name: string) => values.has(name),
      set: vi.fn((name: string, value: string) => void values.set(name, value)),
      delete: vi.fn((name: string) => void values.delete(name)),
    },
    verify: vi.fn(),
  };
});

vi.mock('next/headers', () => ({ cookies: async () => mocks.store }));
vi.mock('~/core/auth/server/privy-identity-token', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/auth/server/privy-identity-token')>()),
  verifyPrivyIdentityToken: mocks.verify,
}));

const { DELETE, POST } = await import('./route');

const WALLET = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';

function request(method: 'POST' | 'DELETE', opts: { token?: string; origin?: string; body?: string } = {}) {
  const headers = new Headers({ host: 'example.test', origin: opts.origin ?? 'https://example.test' });
  if (opts.token) headers.set('authorization', `Bearer ${opts.token}`);
  return new Request('https://example.test/api/wallet-session', { method, headers, body: opts.body });
}

beforeEach(() => {
  mocks.values.clear();
  mocks.store.set.mockClear();
  mocks.store.delete.mockClear();
  mocks.verify.mockReset();
  vi.stubEnv('WALLET_SESSION_SECRET', 'test-secret');
  vi.stubEnv('NEXT_PUBLIC_PRIVY_APP_ID', 'app');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('POST /api/wallet-session', () => {
  it('issues a session for the wallet the token proves', async () => {
    mocks.verify.mockResolvedValue({ userId: 'did:privy:1', walletAddress: WALLET });

    const res = await POST(request('POST', { token: 'good' }));

    expect(await res.json()).toEqual({ wallet: WALLET, status: 'issued' });
    expect(mocks.verify).toHaveBeenCalledWith('good', { appId: 'app' });
    expect(readWalletSessionFrom(mocks.store)?.address.toLowerCase()).toBe(WALLET);
  });

  it('writes nothing for a missing or unverified token, whatever the body names', async () => {
    mocks.verify.mockResolvedValue(null);
    mocks.values.set(LEGACY_WALLET_ADDRESS, OTHER);

    const missing = await POST(request('POST', { body: JSON.stringify({ address: OTHER }) }));
    const forged = await POST(request('POST', { token: 'forged', body: JSON.stringify({ address: OTHER }) }));

    expect(missing.status).toBe(401);
    expect(forged.status).toBe(401);
    expect(mocks.store.set).not.toHaveBeenCalled();
    expect(mocks.store.delete).not.toHaveBeenCalled();
  });

  it('writes nothing for a token without an embedded wallet', async () => {
    mocks.verify.mockResolvedValue({ userId: 'did:privy:1', walletAddress: null });
    const res = await POST(request('POST', { token: 'good' }));
    expect(res.status).toBe(401);
    expect(mocks.store.set).not.toHaveBeenCalled();
  });

  // A write on every visit is what #2672 was; the client refreshes only on `issued`.
  it('does not rewrite a current session for the same wallet', async () => {
    mocks.values.set(WALLET_SESSION, signWalletSession(WALLET)!);
    mocks.verify.mockResolvedValue({ userId: 'did:privy:1', walletAddress: WALLET });

    const res = await POST(request('POST', { token: 'good' }));

    expect(await res.json()).toEqual({ wallet: WALLET, status: 'unchanged' });
    expect(mocks.store.set).not.toHaveBeenCalled();
  });

  it('renews a session past the renewal age', async () => {
    const old = Date.now() - (WALLET_SESSION_RENEW_AFTER_SECONDS + 60) * 1000;
    mocks.values.set(WALLET_SESSION, signWalletSession(WALLET, old)!);
    mocks.verify.mockResolvedValue({ userId: 'did:privy:1', walletAddress: WALLET });

    const res = await POST(request('POST', { token: 'good' }));

    expect(await res.json()).toEqual({ wallet: WALLET, status: 'renewed' });
    expect(readWalletSessionFrom(mocks.store)?.renewalDue).toBe(false);
  });

  it('replaces a session for another wallet', async () => {
    mocks.values.set(WALLET_SESSION, signWalletSession(OTHER)!);
    mocks.verify.mockResolvedValue({ userId: 'did:privy:1', walletAddress: WALLET });

    const res = await POST(request('POST', { token: 'good' }));

    expect(await res.json()).toEqual({ wallet: WALLET, status: 'issued' });
    expect(readWalletSessionFrom(mocks.store)?.address.toLowerCase()).toBe(WALLET);
  });

  it('drops a legacy cookie and issues a session in its place', async () => {
    mocks.values.set(LEGACY_WALLET_ADDRESS, WALLET);
    mocks.verify.mockResolvedValue({ userId: 'did:privy:1', walletAddress: WALLET });

    const res = await POST(request('POST', { token: 'good' }));

    expect(await res.json()).toEqual({ wallet: WALLET, status: 'issued' });
    expect(mocks.values.has(LEGACY_WALLET_ADDRESS)).toBe(false);
    expect(mocks.values.has(WALLET_SESSION)).toBe(true);
  });

  it('refuses cross-origin requests', async () => {
    const res = await POST(request('POST', { token: 'good', origin: 'https://attacker.test' }));
    expect(res.status).toBe(403);
    expect(mocks.verify).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/wallet-session', () => {
  it('clears the session and any legacy cookie', async () => {
    mocks.values.set(WALLET_SESSION, signWalletSession(WALLET)!);
    mocks.values.set(LEGACY_WALLET_ADDRESS, WALLET);

    const res = await DELETE(request('DELETE'));

    expect(res.status).toBe(204);
    expect(mocks.values.size).toBe(0);
  });

  it('refuses cross-origin requests', async () => {
    mocks.values.set(WALLET_SESSION, signWalletSession(WALLET)!);
    const res = await DELETE(request('DELETE', { origin: 'https://attacker.test' }));
    expect(res.status).toBe(403);
    expect(mocks.values.has(WALLET_SESSION)).toBe(true);
  });
});

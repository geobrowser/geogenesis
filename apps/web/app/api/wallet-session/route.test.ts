import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  LEGACY_WALLET_ADDRESS,
  WALLET_SESSION,
  readWalletSessionFrom,
  signWalletSession,
} from '~/core/auth/server/wallet-session';
import { WALLET_SESSION_HINT, WALLET_SESSION_RENEW_AFTER_SECONDS } from '~/core/auth/wallet-session-shared';

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
    rateLimit: vi.fn(async () => ({ ok: true }) as { ok: true } | { ok: false; retryAfter: number }),
    accountRateLimit: vi.fn(
      async (_userId: string) => ({ ok: true }) as { ok: true } | { ok: false; retryAfter: number }
    ),
  };
});

vi.mock('next/headers', () => ({ cookies: async () => mocks.store }));
vi.mock('~/core/auth/server/privy-identity-token', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/auth/server/privy-identity-token')>()),
  // `mocks.verify` resolves an identity, null (bad token) or 'unavailable' (JWKS outage).
  verifyPrivyIdentityTokenDetailed: async (...args: unknown[]) => {
    const result = await mocks.verify(...args);
    if (result === 'unavailable') return { ok: false, reason: 'unavailable' };
    return result ? { ok: true, identity: result } : { ok: false, reason: 'invalid' };
  },
}));

vi.mock('./rate-limit', () => ({
  checkWalletSessionIpRateLimit: mocks.rateLimit,
  checkWalletSessionAccountRateLimit: mocks.accountRateLimit,
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
  mocks.rateLimit.mockClear();
  mocks.accountRateLimit.mockReset().mockResolvedValue({ ok: true });
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
    expect(mocks.store.set).toHaveBeenCalledWith(
      WALLET_SESSION_HINT,
      '1',
      expect.objectContaining({ httpOnly: false })
    );
  });

  it('answers 503 unconfigured when there is no secret to sign with', async () => {
    vi.stubEnv('WALLET_SESSION_SECRET', '');
    vi.stubEnv('NODE_ENV', 'production');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.verify.mockResolvedValue({ userId: 'did:privy:1', walletAddress: WALLET });

    const res = await POST(request('POST', { token: 'good' }));

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ wallet: null, status: 'unconfigured' });
    expect(mocks.store.set).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('caps requests per IP before verifying', async () => {
    mocks.rateLimit.mockResolvedValueOnce({ ok: false, retryAfter: 9 });
    const res = await POST(request('POST', { token: 'good' }));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('9');
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it('caps each verified account, without capping another account behind the same IP', async () => {
    mocks.accountRateLimit.mockImplementation(async userId =>
      userId === 'did:privy:busy' ? { ok: false, retryAfter: 30 } : { ok: true }
    );
    mocks.values.set(LEGACY_WALLET_ADDRESS, WALLET);
    mocks.verify.mockResolvedValueOnce({ userId: 'did:privy:busy', walletAddress: WALLET });
    mocks.verify.mockResolvedValueOnce({ userId: 'did:privy:other', walletAddress: OTHER });

    const busy = await POST(request('POST', { token: 'busy' }));
    expect(busy.status).toBe(429);
    expect(busy.headers.get('Retry-After')).toBe('30');
    expect(await busy.json()).toEqual({ wallet: null, status: 'rate_limited' });
    expect(mocks.store.set).not.toHaveBeenCalled();
    expect(mocks.store.delete).not.toHaveBeenCalled();

    const other = await POST(request('POST', { token: 'other' }));
    expect(await other.json()).toEqual({ wallet: OTHER, status: 'issued' });
    expect(mocks.accountRateLimit.mock.calls.map(([id]) => id)).toEqual(['did:privy:busy', 'did:privy:other']);
  });

  it('never counts an unverified token against an account', async () => {
    mocks.verify.mockResolvedValue(null);
    await POST(request('POST', { token: 'forged' }));
    expect(mocks.accountRateLimit).not.toHaveBeenCalled();
  });

  it('writes nothing for a missing or unverified token, whatever the body names', async () => {
    mocks.verify.mockResolvedValue(null);
    mocks.values.set(LEGACY_WALLET_ADDRESS, OTHER);

    const missing = await POST(request('POST', { body: JSON.stringify({ address: OTHER }) }));
    const forged = await POST(request('POST', { token: 'forged', body: JSON.stringify({ address: OTHER }) }));

    expect(missing.status).toBe(401);
    expect(forged.status).toBe(401);
    expect(await forged.json()).toEqual({ wallet: null, status: 'invalid_token' });
    expect(mocks.store.set).not.toHaveBeenCalled();
    expect(mocks.store.delete).not.toHaveBeenCalled();
  });

  it('answers no_wallet for a verified token without an embedded wallet', async () => {
    mocks.verify.mockResolvedValue({ userId: 'did:privy:1', walletAddress: null });
    const res = await POST(request('POST', { token: 'good' }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ wallet: null, status: 'no_wallet' });
    expect(mocks.store.set).not.toHaveBeenCalled();
  });

  it('answers unavailable when Privy keys cannot be fetched', async () => {
    mocks.verify.mockResolvedValue('unavailable');
    const res = await POST(request('POST', { token: 'good' }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ wallet: null, status: 'unavailable' });
    expect(res.headers.get('Retry-After')).toBe('15');
    expect(mocks.store.set).not.toHaveBeenCalled();
  });

  // A write on every visit is what #2672 was; the client refreshes only on `issued`.
  it('adds a missing hint without rewriting the session', async () => {
    const session = signWalletSession(WALLET)!;
    mocks.values.set(WALLET_SESSION, session);
    mocks.verify.mockResolvedValue({ userId: 'did:privy:1', walletAddress: WALLET });

    await POST(request('POST', { token: 'good' }));

    expect(mocks.values.get(WALLET_SESSION)).toBe(session);
    expect(mocks.store.set).toHaveBeenCalledOnce();
    expect(mocks.store.set).toHaveBeenCalledWith(WALLET_SESSION_HINT, '1', expect.anything());
  });

  it('does not rewrite a current session for the same wallet', async () => {
    mocks.values.set(WALLET_SESSION, signWalletSession(WALLET)!);
    mocks.values.set(WALLET_SESSION_HINT, '1');
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
  it('clears the session, its hint and any legacy cookie', async () => {
    mocks.values.set(WALLET_SESSION, signWalletSession(WALLET)!);
    mocks.values.set(WALLET_SESSION_HINT, '1');
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

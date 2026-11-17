import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SYNC_RETRY_DELAYS_MS,
  clearWalletSession,
  forgetSyncedWalletCookie,
  setWalletSessionRefresh,
  syncWalletCookie,
} from './sync-wallet-cookie';
import { WALLET_SESSION_RENEW_AFTER_SECONDS } from './wallet-session-lifetime';

const mocks = vi.hoisted(() => ({
  getToken: vi.fn<() => Promise<string | null>>(),
  setToken: vi.fn(),
  reportEvent: vi.fn(),
  fetch: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('~/core/auth/identity-token', () => ({
  getCachedIdentityToken: mocks.getToken,
  setCachedIdentityToken: mocks.setToken,
}));
vi.mock('~/core/telemetry/logger', () => ({ reportEvent: mocks.reportEvent }));

const ADDRESS = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01' as const;
const LOWER = ADDRESS.toLowerCase();
const OTHER = '0x2222222222222222222222222222222222222222' as const;

function answer(body: { wallet: string | null; status: string }, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

beforeEach(() => {
  forgetSyncedWalletCookie();
  vi.clearAllMocks();
  mocks.getToken.mockResolvedValue('token');
  mocks.fetch.mockImplementation(() => answer({ wallet: LOWER, status: 'unchanged' }));
  vi.stubGlobal('fetch', mocks.fetch);
  setWalletSessionRefresh(mocks.refresh);
});

afterEach(() => {
  setWalletSessionRefresh(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('syncWalletCookie', () => {
  it('sends the identity token, never the address', async () => {
    await syncWalletCookie(ADDRESS);

    expect(mocks.fetch).toHaveBeenCalledOnce();
    const [url, init] = mocks.fetch.mock.calls[0]!;
    expect(url).toBe('/api/wallet-session');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ Authorization: 'Bearer token' });
    expect(init.body).toBeUndefined();
  });

  // #2672: a signed-in tab must not re-render on normal visits or renewals.
  it('does not refresh the page for an unchanged or renewed session', async () => {
    await syncWalletCookie(ADDRESS);
    forgetSyncedWalletCookie();
    mocks.fetch.mockImplementation(() => answer({ wallet: LOWER, status: 'renewed' }));
    await syncWalletCookie(ADDRESS);

    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  // The page was server-rendered signed out (first sign-in, legacy cookie, expired session).
  it('refreshes the page once when a session is issued', async () => {
    mocks.fetch.mockImplementation(() => answer({ wallet: LOWER, status: 'issued' }));

    await syncWalletCookie(ADDRESS);
    await syncWalletCookie(ADDRESS);

    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it('asks again once the memo outlives the renewal interval', async () => {
    vi.useFakeTimers();
    await syncWalletCookie(ADDRESS);
    vi.advanceTimersByTime(WALLET_SESSION_RENEW_AFTER_SECONDS * 1000 + 1);
    await syncWalletCookie(ADDRESS);

    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it('asks again for the same address after the wallet went away', async () => {
    await syncWalletCookie(ADDRESS);
    forgetSyncedWalletCookie();
    await syncWalletCookie(ADDRESS);

    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it('retries on a schedule while there is no token yet', async () => {
    vi.useFakeTimers();
    mocks.getToken.mockResolvedValueOnce(null);

    await syncWalletCookie(ADDRESS);
    expect(mocks.fetch).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(SYNC_RETRY_DELAYS_MS[0]);
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it('drops the cached token and retries when the server cannot verify it', async () => {
    vi.useFakeTimers();
    mocks.fetch.mockImplementationOnce(() => answer({ wallet: null, status: 'unverified' }, 401));

    await syncWalletCookie(ADDRESS);
    expect(mocks.setToken).toHaveBeenCalledWith(null);
    expect(mocks.reportEvent).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(SYNC_RETRY_DELAYS_MS[0]);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not memo a different wallet: drops the token, reports and retries', async () => {
    vi.useFakeTimers();
    mocks.fetch.mockImplementationOnce(() => answer({ wallet: OTHER, status: 'issued' }));

    await syncWalletCookie(ADDRESS);

    expect(mocks.setToken).toHaveBeenCalledWith(null);
    expect(mocks.reportEvent).toHaveBeenCalledWith(expect.objectContaining({ name: 'wallet-session.mismatch' }));
    expect(mocks.refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(SYNC_RETRY_DELAYS_MS[0]);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not record a wallet the tab left while the request was in flight', async () => {
    let release!: () => void;
    mocks.fetch.mockImplementationOnce(
      () =>
        new Promise<Response>(resolve => {
          release = () => resolve(new Response(JSON.stringify({ wallet: LOWER, status: 'issued' })));
        })
    );

    const first = syncWalletCookie(ADDRESS);
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce());
    forgetSyncedWalletCookie();
    release();
    await first;

    expect(mocks.refresh).not.toHaveBeenCalled();
    await syncWalletCookie(ADDRESS);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it('retries a server or network error instead of failing the smart-account query', async () => {
    vi.useFakeTimers();
    mocks.fetch.mockImplementationOnce(() => Promise.resolve(new Response(null, { status: 500 })));

    await expect(syncWalletCookie(ADDRESS)).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(SYNC_RETRY_DELAYS_MS[0]);

    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.setToken).not.toHaveBeenCalled();
  });
});

describe('clearWalletSession', () => {
  it('deletes the server session and forgets the synced wallet', async () => {
    await syncWalletCookie(ADDRESS);
    mocks.fetch.mockImplementationOnce(() => Promise.resolve(new Response(null, { status: 204 })));

    await clearWalletSession();

    expect(mocks.fetch).toHaveBeenLastCalledWith('/api/wallet-session', {
      method: 'DELETE',
      credentials: 'same-origin',
    });
    await syncWalletCookie(ADDRESS);
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
  });

  it('throws when the server did not confirm', async () => {
    mocks.fetch.mockImplementationOnce(() => Promise.resolve(new Response(null, { status: 403 })));
    await expect(clearWalletSession()).rejects.toThrow();
  });
});

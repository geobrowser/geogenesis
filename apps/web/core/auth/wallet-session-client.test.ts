import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SESSION_RETRY_DELAYS_MS,
  clearWalletSession,
  forgetWalletSession,
  hasWalletSessionHint,
  resetWalletSessionClientForTests,
  syncWalletSession,
} from './wallet-session-client';

const mocks = vi.hoisted(() => ({
  getToken: vi.fn<() => Promise<string | null>>(),
  setToken: vi.fn(),
  fetch: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('~/core/auth/identity-token', () => ({
  getCachedIdentityToken: mocks.getToken,
  setCachedIdentityToken: mocks.setToken,
}));

const WALLET = '0x' + '1'.repeat(40);

function answer(status: number, body?: { wallet: string | null; status: string }) {
  return Promise.resolve(new Response(body ? JSON.stringify(body) : null, { status }));
}

beforeEach(() => {
  resetWalletSessionClientForTests();
  vi.clearAllMocks();
  mocks.getToken.mockResolvedValue('fresh');
  mocks.fetch.mockImplementation(() => answer(200, { wallet: WALLET, status: 'unchanged' }));
  vi.stubGlobal('fetch', mocks.fetch);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('syncWalletSession', () => {
  it('posts the token as a bearer and nothing else', async () => {
    await syncWalletSession('token', mocks.refresh);

    const [url, init] = mocks.fetch.mock.calls[0]!;
    expect(url).toBe('/api/wallet-session');
    expect(init).toMatchObject({ method: 'POST', headers: { Authorization: 'Bearer token' } });
    expect(init.body).toBeUndefined();
  });

  it('posts once per token value', async () => {
    await syncWalletSession('token', mocks.refresh);
    await syncWalletSession('token', mocks.refresh);
    await syncWalletSession('reissued', mocks.refresh);

    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  // A refresh on `unchanged` or `renewed` would re-render a signed-in tab on every visit.
  it('refreshes only when a session was issued', async () => {
    await syncWalletSession('a', mocks.refresh);
    mocks.fetch.mockImplementationOnce(() => answer(200, { wallet: WALLET, status: 'renewed' }));
    await syncWalletSession('b', mocks.refresh);
    expect(mocks.refresh).not.toHaveBeenCalled();

    mocks.fetch.mockImplementationOnce(() => answer(200, { wallet: WALLET, status: 'issued' }));
    await syncWalletSession('c', mocks.refresh);
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it('stops for the page when the server has no secret, without retrying or dropping the token', async () => {
    vi.useFakeTimers();
    mocks.fetch.mockImplementation(() => answer(503, { wallet: null, status: 'unconfigured' }));

    await syncWalletSession('a', mocks.refresh);
    await vi.advanceTimersByTimeAsync(SESSION_RETRY_DELAYS_MS[1] * 2);
    await syncWalletSession('b', mocks.refresh);

    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.setToken).not.toHaveBeenCalled();
    expect(mocks.getToken).not.toHaveBeenCalled();
  });

  it('drops an invalid token once and retries, bounded, with a fresh one', async () => {
    vi.useFakeTimers();
    mocks.fetch.mockImplementation(() => answer(401, { wallet: null, status: 'invalid_token' }));

    await syncWalletSession('stale', mocks.refresh);
    expect(mocks.setToken).toHaveBeenCalledWith(null);

    await vi.advanceTimersByTimeAsync(SESSION_RETRY_DELAYS_MS[0]);
    expect(mocks.fetch).toHaveBeenLastCalledWith(
      '/api/wallet-session',
      expect.objectContaining({ headers: { Authorization: 'Bearer fresh' } })
    );
    await vi.advanceTimersByTimeAsync(SESSION_RETRY_DELAYS_MS[1]);
    await vi.advanceTimersByTimeAsync(SESSION_RETRY_DELAYS_MS[1] * 4);

    expect(mocks.fetch).toHaveBeenCalledTimes(1 + SESSION_RETRY_DELAYS_MS.length);
  });

  // Debates and calls poll the shared cache; each drop would become a Privy users/me call.
  it('drops the shared cache at most once per page under a lasting invalid_token', async () => {
    vi.useFakeTimers();
    mocks.fetch.mockImplementation(() => answer(401, { wallet: null, status: 'invalid_token' }));

    for (const token of ['t1', 't2', 't3', 't4']) await syncWalletSession(token, mocks.refresh);
    await vi.advanceTimersByTimeAsync(SESSION_RETRY_DELAYS_MS[1] * 4);

    expect(mocks.setToken).toHaveBeenCalledOnce();
  });

  it('treats no_wallet as final for that token, without dropping the cache', async () => {
    vi.useFakeTimers();
    mocks.fetch.mockImplementation(() => answer(403, { wallet: null, status: 'no_wallet' }));

    await syncWalletSession('t1', mocks.refresh);
    await vi.advanceTimersByTimeAsync(SESSION_RETRY_DELAYS_MS[1] * 4);
    expect(mocks.fetch).toHaveBeenCalledOnce();

    // Once the wallet exists Privy mints a new token, which posts again.
    await syncWalletSession('t2', mocks.refresh);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.setToken).not.toHaveBeenCalled();
    expect(mocks.getToken).not.toHaveBeenCalled();
  });

  it('retries unavailable on the bounded schedule without dropping the cache', async () => {
    vi.useFakeTimers();
    mocks.fetch.mockImplementation(() => answer(503, { wallet: null, status: 'unavailable' }));

    await syncWalletSession('t1', mocks.refresh);
    await vi.advanceTimersByTimeAsync(SESSION_RETRY_DELAYS_MS[1] * 4);

    expect(mocks.fetch).toHaveBeenCalledTimes(1 + SESSION_RETRY_DELAYS_MS.length);
    expect(mocks.setToken).not.toHaveBeenCalled();
  });

  it('retries a network error without dropping the token', async () => {
    vi.useFakeTimers();
    mocks.fetch.mockImplementationOnce(() => Promise.reject(new TypeError('offline')));

    await expect(syncWalletSession('a', mocks.refresh)).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(SESSION_RETRY_DELAYS_MS[0]);

    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.setToken).not.toHaveBeenCalled();
  });

  it('ignores an answer for a token the page has moved past', async () => {
    let release!: () => void;
    mocks.fetch.mockImplementationOnce(
      () =>
        new Promise<Response>(resolve => {
          release = () => resolve(new Response(JSON.stringify({ wallet: WALLET, status: 'issued' })));
        })
    );

    const first = syncWalletSession('old', mocks.refresh);
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce());
    forgetWalletSession();
    release();
    await first;

    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('undoes a session issued by a POST that finished after sign-out', async () => {
    let release!: () => void;
    mocks.fetch.mockImplementationOnce(
      () =>
        new Promise<Response>(resolve => {
          release = () => resolve(new Response(JSON.stringify({ wallet: WALLET, status: 'issued' })));
        })
    );
    mocks.fetch.mockImplementation(() => answer(204));

    const pending = syncWalletSession('t1', mocks.refresh);
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce());
    await clearWalletSession();
    release();
    await pending;

    const deletes = mocks.fetch.mock.calls.filter(([, init]) => init?.method === 'DELETE');
    expect(deletes).toHaveLength(2);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('does not undo a newer sign-in', async () => {
    let release!: () => void;
    mocks.fetch.mockImplementationOnce(
      () =>
        new Promise<Response>(resolve => {
          release = () => resolve(new Response(JSON.stringify({ wallet: WALLET, status: 'issued' })));
        })
    );

    const pending = syncWalletSession('t1', mocks.refresh);
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce());
    forgetWalletSession();
    await syncWalletSession('t2', mocks.refresh);
    release();
    await pending;

    expect(mocks.fetch.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
  });
});

describe('clearWalletSession', () => {
  it('deletes the server session and lets the same token sync again', async () => {
    await syncWalletSession('token', mocks.refresh);
    mocks.fetch.mockImplementationOnce(() => answer(204));

    await clearWalletSession();
    await syncWalletSession('token', mocks.refresh);

    expect(mocks.fetch.mock.calls[1]).toEqual([
      '/api/wallet-session',
      { method: 'DELETE', credentials: 'same-origin' },
    ]);
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
  });

  it('throws when the server did not confirm', async () => {
    mocks.fetch.mockImplementationOnce(() => answer(403));
    await expect(clearWalletSession()).rejects.toThrow();
  });
});

describe('hasWalletSessionHint', () => {
  it('reads the hint cookie', () => {
    vi.stubGlobal('document', { cookie: 'other=1; walletSessionHint=1' });
    expect(hasWalletSessionHint()).toBe(true);
    vi.stubGlobal('document', { cookie: 'other=1' });
    expect(hasWalletSessionHint()).toBe(false);
  });
});

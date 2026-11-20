import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  NO_WALLET_RETRY_DELAYS_MS,
  SESSION_RETRY_DELAYS_MS,
  clearWalletSession,
  forgetWalletSession,
  hasWalletSessionHint,
  noteEmbeddedWallet,
  resetWalletSessionClientForTests,
  syncWalletSession,
  walletSessionSyncState,
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

  it('retries no_wallet with a fresh token as soon as the wallet appears', async () => {
    vi.useFakeTimers();
    mocks.fetch.mockImplementationOnce(() => answer(403, { wallet: null, status: 'no_wallet' }));
    mocks.fetch.mockImplementationOnce(() => answer(200, { wallet: WALLET, status: 'issued' }));

    await syncWalletSession('before-wallet', mocks.refresh);
    noteEmbeddedWallet(mocks.refresh);
    await vi.waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());

    expect(mocks.setToken).toHaveBeenCalledOnce();
    expect(mocks.getToken).toHaveBeenCalledOnce();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.fetch).toHaveBeenLastCalledWith(
      '/api/wallet-session',
      expect.objectContaining({ headers: { Authorization: 'Bearer fresh' } })
    );
    await vi.advanceTimersByTimeAsync(NO_WALLET_RETRY_DELAYS_MS[2] * 2);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it('retries at once when the wallet was already seen before no_wallet', async () => {
    mocks.fetch.mockImplementationOnce(() => answer(403, { wallet: null, status: 'no_wallet' }));
    noteEmbeddedWallet(mocks.refresh);

    await syncWalletSession('before-wallet', mocks.refresh);
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
    expect(mocks.setToken).toHaveBeenCalledOnce();
  });

  it('lets an in-flight POST for a reissued token answer when the wallet appears', async () => {
    mocks.fetch.mockImplementationOnce(() => answer(403, { wallet: null, status: 'no_wallet' }));
    await syncWalletSession('before-wallet', mocks.refresh);

    let release!: () => void;
    mocks.fetch.mockImplementationOnce(
      () =>
        new Promise<Response>(resolve => {
          release = () => resolve(new Response(JSON.stringify({ wallet: WALLET, status: 'issued' })));
        })
    );
    const pending = syncWalletSession('reissued', mocks.refresh);
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
    noteEmbeddedWallet(mocks.refresh);
    release();
    await pending;

    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.getToken).not.toHaveBeenCalled();
    expect(mocks.setToken).not.toHaveBeenCalled();
  });

  it('lets a fallback timer leave an in-flight POST for a reissued token alone', async () => {
    vi.useFakeTimers();
    mocks.fetch.mockImplementationOnce(() => answer(403, { wallet: null, status: 'no_wallet' }));
    await syncWalletSession('before-wallet', mocks.refresh);

    let release!: () => void;
    mocks.fetch.mockImplementationOnce(
      () =>
        new Promise<Response>(resolve => {
          release = () => resolve(new Response(JSON.stringify({ wallet: WALLET, status: 'issued' })));
        })
    );
    const pending = syncWalletSession('reissued', mocks.refresh);
    await vi.advanceTimersByTimeAsync(NO_WALLET_RETRY_DELAYS_MS[0]);
    expect(mocks.getToken).not.toHaveBeenCalled();

    release();
    await pending;
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.setToken).not.toHaveBeenCalled();
  });

  it('retries for the wallet while only a stale POST is in flight', async () => {
    let releaseStale!: () => void;
    mocks.fetch.mockImplementationOnce(
      () =>
        new Promise<Response>(resolve => {
          releaseStale = () =>
            resolve(new Response(JSON.stringify({ wallet: null, status: 'no_wallet' }), { status: 403 }));
        })
    );
    mocks.fetch.mockImplementationOnce(() => answer(403, { wallet: null, status: 'no_wallet' }));
    mocks.fetch.mockImplementationOnce(() => answer(200, { wallet: WALLET, status: 'issued' }));
    noteEmbeddedWallet(mocks.refresh);

    const stale = syncWalletSession('t1', mocks.refresh);
    await syncWalletSession('t2', mocks.refresh);
    await vi.waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    releaseStale();
    await stale;

    expect(mocks.getToken).toHaveBeenCalledOnce();
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
  });

  it('keeps the fallback going when a fresh token is not available yet', async () => {
    vi.useFakeTimers();
    mocks.fetch.mockImplementation(() => answer(403, { wallet: null, status: 'no_wallet' }));
    mocks.getToken.mockResolvedValueOnce(null);

    await syncWalletSession('t1', mocks.refresh);
    await vi.advanceTimersByTimeAsync(NO_WALLET_RETRY_DELAYS_MS[2] * 4);

    expect(mocks.setToken).toHaveBeenCalledTimes(NO_WALLET_RETRY_DELAYS_MS.length);
    expect(mocks.fetch).toHaveBeenCalledTimes(NO_WALLET_RETRY_DELAYS_MS.length);
  });

  it('bounds fresh-token retries when the wallet never appears', async () => {
    vi.useFakeTimers();
    mocks.fetch.mockImplementation(() => answer(403, { wallet: null, status: 'no_wallet' }));
    let n = 0;
    mocks.getToken.mockImplementation(async () => `fresh-${++n}`);

    await syncWalletSession('t1', mocks.refresh);
    await vi.advanceTimersByTimeAsync(NO_WALLET_RETRY_DELAYS_MS[2] * 4);

    expect(mocks.setToken).toHaveBeenCalledTimes(NO_WALLET_RETRY_DELAYS_MS.length);
    expect(mocks.fetch).toHaveBeenCalledTimes(1 + NO_WALLET_RETRY_DELAYS_MS.length);
    expect(mocks.refresh).not.toHaveBeenCalled();
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

describe('a POST from a previous sign-in', () => {
  function held(status: string) {
    let release!: () => void;
    mocks.fetch.mockImplementationOnce(
      () =>
        new Promise<Response>(resolve => {
          release = () => resolve(new Response(JSON.stringify({ wallet: WALLET, status })));
        })
    );
    return () => release();
  }

  it("re-posts the new account's token when the old answer lands last", async () => {
    const releaseOld = held('issued');
    const old = syncWalletSession('old-account', mocks.refresh);
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce());

    forgetWalletSession();
    mocks.fetch.mockImplementationOnce(() => answer(200, { wallet: WALLET, status: 'issued' }));
    await syncWalletSession('new-account', mocks.refresh);
    releaseOld();
    await old;
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(3));

    expect(mocks.fetch).toHaveBeenLastCalledWith(
      '/api/wallet-session',
      expect.objectContaining({ method: 'POST', headers: { Authorization: 'Bearer new-account' } })
    );
  });

  it("leaves the new account's POST to answer when it is still in flight", async () => {
    const releaseOld = held('issued');
    const old = syncWalletSession('old-account', mocks.refresh);
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce());

    forgetWalletSession();
    const releaseNew = held('issued');
    const next = syncWalletSession('new-account', mocks.refresh);
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
    releaseOld();
    await old;
    releaseNew();
    await next;

    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});

describe('walletSessionSyncState', () => {
  it('names the wallet after an ok answer, and forgets it on sign-out', async () => {
    mocks.fetch.mockImplementationOnce(() =>
      answer(200, { wallet: WALLET.toUpperCase().replace('0X', '0x'), status: 'unchanged' })
    );
    await syncWalletSession('t1', mocks.refresh);
    expect(walletSessionSyncState()).toEqual({ wallet: WALLET, gaveUp: false });

    forgetWalletSession();
    expect(walletSessionSyncState()).toEqual({ wallet: null, gaveUp: false });
  });

  it('gives up at once on a failure the same token may outlast', async () => {
    vi.useFakeTimers();
    mocks.fetch.mockImplementation(() => answer(503, { wallet: null, status: 'unavailable' }));
    await syncWalletSession('t1', mocks.refresh);
    expect(walletSessionSyncState().gaveUp).toBe(true);
  });

  it('waits out the no_wallet retries before giving up', async () => {
    vi.useFakeTimers();
    mocks.fetch.mockImplementation(() => answer(403, { wallet: null, status: 'no_wallet' }));
    let n = 0;
    mocks.getToken.mockImplementation(async () => `fresh-${++n}`);

    await syncWalletSession('t1', mocks.refresh);
    expect(walletSessionSyncState().gaveUp).toBe(false);
    await vi.advanceTimersByTimeAsync(NO_WALLET_RETRY_DELAYS_MS[2] * 4);
    expect(walletSessionSyncState().gaveUp).toBe(true);
  });

  it('gives up for a later sign-in once the server has no secret', async () => {
    mocks.fetch.mockImplementation(() => answer(503, { wallet: null, status: 'unconfigured' }));
    await syncWalletSession('t1', mocks.refresh);
    forgetWalletSession();
    expect(walletSessionSyncState().gaveUp).toBe(false);

    await syncWalletSession('t2', mocks.refresh);
    expect(walletSessionSyncState().gaveUp).toBe(true);
    expect(mocks.fetch).toHaveBeenCalledOnce();
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

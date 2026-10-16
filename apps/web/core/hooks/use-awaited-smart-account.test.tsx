import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ready: false,
  authenticated: false,
  identityToken: null as string | null,
  smartAccountAddress: null as string | null,
  fetch: vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))),
}));

vi.mock('@geogenesis/auth', () => ({
  usePrivy: () => ({ ready: mocks.ready, authenticated: mocks.authenticated }),
  useIdentityToken: () => ({ identityToken: mocks.identityToken }),
}));

vi.mock('./use-smart-account', () => ({
  useSmartAccount: () => ({
    smartAccount: mocks.smartAccountAddress ? { account: { address: mocks.smartAccountAddress } } : null,
  }),
}));

const COOKIE = '0x1111111111111111111111111111111111111111';

// The module keeps a once-per-page flag for the cookie clear, so each test gets a fresh copy.
async function load() {
  vi.resetModules();
  return import('./use-awaited-smart-account');
}

beforeEach(() => {
  mocks.ready = false;
  mocks.authenticated = false;
  mocks.identityToken = null;
  mocks.smartAccountAddress = null;
  mocks.fetch.mockClear();
  vi.stubGlobal('fetch', mocks.fetch);
});

describe('useFeedViewer', () => {
  it('waits for the identity token while Privy is still restoring a cookie-holding reader', async () => {
    const { useFeedViewer } = await load();
    const { result } = renderHook(() => useFeedViewer(COOKIE, true));
    expect(result.current.awaitingIdentityToken).toBe(true);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('stops waiting once Privy has restored and found no session', async () => {
    const { useFeedViewer } = await load();
    const { result, rerender } = renderHook(() => useFeedViewer(COOKIE, true));
    expect(result.current.awaitingIdentityToken).toBe(true);

    mocks.ready = true;
    rerender();

    expect(result.current.awaitingIdentityToken).toBe(false);
    // The key stays on the cookie address, so the page already in flight is not refetched.
    expect(result.current.viewerAddress).toBe(COOKIE);
  });

  it('clears the stale wallet cookie once, when Privy finds no session', async () => {
    mocks.ready = true;
    const { useFeedViewer } = await load();
    renderHook(() => useFeedViewer(COOKIE, true));
    renderHook(() => useFeedViewer(COOKIE, false));
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenCalledWith('/api/wallet-cookie', { method: 'DELETE' });
  });

  it('keeps the cookie, and the wait, for a reader Privy has signed in', async () => {
    mocks.ready = true;
    mocks.authenticated = true;
    const { useFeedViewer } = await load();
    const { result } = renderHook(() => useFeedViewer(COOKIE, true));
    expect(result.current.awaitingIdentityToken).toBe(true);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('does nothing for a reader with no cookie', async () => {
    mocks.ready = true;
    const { useFeedViewer } = await load();
    const { result } = renderHook(() => useFeedViewer(null, true));
    expect(result.current).toEqual({ viewerAddress: null, awaitingIdentityToken: false });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

describe('useAwaitedSmartAccount', () => {
  it('waits while Privy restores, and stops once it finds no session', async () => {
    const { useAwaitedSmartAccount } = await load();
    const { result, rerender } = renderHook(() => useAwaitedSmartAccount(true));
    expect(result.current.awaitingAccount).toBe(true);

    mocks.ready = true;
    rerender();

    expect(result.current.awaitingAccount).toBe(false);
  });
});

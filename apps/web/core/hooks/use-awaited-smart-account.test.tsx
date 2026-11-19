import { act, renderHook } from '@testing-library/react';

import * as React from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { walletCookieQueryKey } from '~/core/cookie/wallet-cookie-query-key';

const mocks = vi.hoisted(() => ({
  ready: false,
  authenticated: false,
  identityToken: null as string | null,
  accountAddress: null as string | null,
  fetch: vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))),
}));

vi.mock('~/core/wallet/auth-hooks', () => ({
  usePrivy: () => ({ ready: mocks.ready, authenticated: mocks.authenticated }),
  useIdentityToken: () => ({ identityToken: mocks.identityToken }),
}));

vi.mock('~/core/wallet/account-readiness', () => ({ useAccountAddress: () => mocks.accountAddress }));

const COOKIE = '0x1111111111111111111111111111111111111111';
const ACCOUNT = '0x2222222222222222222222222222222222222222';

// The module keeps a once-per-page flag for the cookie clear, so each test gets a fresh copy, and
// react-query with it so the provider and the hook share one context.
async function load() {
  vi.resetModules();
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hooks = await import('./use-awaited-smart-account');
  const render = <T,>(hook: () => T) => renderHook(hook, { wrapper });
  return { ...hooks, queryClient, render };
}

beforeEach(() => {
  mocks.ready = false;
  mocks.authenticated = false;
  mocks.identityToken = null;
  mocks.accountAddress = null;
  mocks.fetch.mockClear();
  vi.stubGlobal('fetch', mocks.fetch);
});

describe('useFeedViewer', () => {
  it('waits for the identity token while Privy is still restoring a cookie-holding reader', async () => {
    const { useFeedViewer, render } = await load();
    const { result } = render(() => useFeedViewer(COOKIE, true));
    expect(result.current.awaitingIdentityToken).toBe(true);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('stops waiting once Privy has restored and found no session', async () => {
    const { useFeedViewer, render } = await load();
    const { result, rerender } = render(() => useFeedViewer(COOKIE, true));
    expect(result.current.awaitingIdentityToken).toBe(true);

    mocks.ready = true;
    rerender();

    expect(result.current.awaitingIdentityToken).toBe(false);
    // The key stays on the cookie address, so the page already in flight is not refetched.
    expect(result.current.viewerAddress).toBe(COOKIE);
  });

  it('clears the stale wallet cookie once, when Privy finds no session', async () => {
    mocks.ready = true;
    const { useFeedViewer, render } = await load();
    render(() => useFeedViewer(COOKIE, true));
    render(() => useFeedViewer(COOKIE, false));
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenCalledWith('/api/wallet-cookie', { method: 'DELETE' });
  });

  it('keeps the cookie, and the wait, for a reader Privy has signed in', async () => {
    mocks.ready = true;
    mocks.authenticated = true;
    const { useFeedViewer, render } = await load();
    const { result } = render(() => useFeedViewer(COOKIE, true));
    expect(result.current.awaitingIdentityToken).toBe(true);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('does nothing for a reader with no cookie', async () => {
    mocks.ready = true;
    const { useFeedViewer, render } = await load();
    const { result } = render(() => useFeedViewer(null, true));
    expect(result.current).toEqual({ viewerAddress: null, awaitingIdentityToken: false });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('keys a reader with no cookie on their account only once the cookie is synced', async () => {
    mocks.ready = true;
    mocks.authenticated = true;
    mocks.accountAddress = ACCOUNT;
    const { useFeedViewer, render, queryClient } = await load();
    const { result, rerender } = render(() => useFeedViewer(null, false));
    expect(result.current.viewerAddress).toBeNull();

    act(() => queryClient.setQueryData(walletCookieQueryKey(ACCOUNT), ACCOUNT));
    rerender();

    expect(result.current.viewerAddress).toBe(ACCOUNT);
  });

  it('keeps a previous viewer’s cookie as the key until the cookie is synced', async () => {
    mocks.ready = true;
    mocks.authenticated = true;
    mocks.accountAddress = ACCOUNT;
    const { useFeedViewer, render, queryClient } = await load();
    const { result, rerender } = render(() => useFeedViewer(COOKIE, false));
    expect(result.current.viewerAddress).toBe(COOKIE);

    act(() => queryClient.setQueryData(walletCookieQueryKey(ACCOUNT), ACCOUNT));
    rerender();

    expect(result.current.viewerAddress).toBe(ACCOUNT);
  });

  it('keys on the account straight away when the cookie already holds it', async () => {
    mocks.ready = true;
    mocks.authenticated = true;
    mocks.accountAddress = COOKIE;
    const { useFeedViewer, render } = await load();
    const { result } = render(() => useFeedViewer(COOKIE, false));

    expect(result.current.viewerAddress).toBe(COOKIE);
  });
});

describe('useAwaitedSmartAccount', () => {
  it('waits while Privy restores, and stops once it finds no session', async () => {
    const { useAwaitedSmartAccount, render } = await load();
    const { result, rerender } = render(() => useAwaitedSmartAccount(true));
    expect(result.current.awaitingAccount).toBe(true);

    mocks.ready = true;
    rerender();

    expect(result.current.awaitingAccount).toBe(false);
  });
});

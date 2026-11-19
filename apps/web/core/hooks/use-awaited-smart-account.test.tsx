import { renderHook } from '@testing-library/react';

import * as React from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ready: false,
  authenticated: false,
  identityToken: null as string | null,
  accountAddress: null as string | null,
  sessionWallet: null as string | null,
  fetch: vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))),
}));

vi.mock('~/core/wallet/auth-hooks', () => ({
  usePrivy: () => ({ ready: mocks.ready, authenticated: mocks.authenticated }),
  useIdentityToken: () => ({ identityToken: mocks.identityToken }),
}));

vi.mock('~/core/wallet/account-readiness', () => ({ useAccountAddress: () => mocks.accountAddress }));
vi.mock('~/core/auth/wallet-session-sync', () => ({
  useWalletSessionSync: (address: string | null) => {
    const synced = Boolean(address) && address === mocks.sessionWallet;
    return { synced, settled: synced };
  },
}));

const SESSION = '0x1111111111111111111111111111111111111111';
const ACCOUNT = '0x2222222222222222222222222222222222222222';

// A fresh copy per test, and react-query with it so the provider and the hook share one context.
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
  mocks.sessionWallet = null;
  mocks.fetch.mockClear();
  vi.stubGlobal('fetch', mocks.fetch);
});

describe('useFeedViewer', () => {
  it('waits for the identity token while Privy is still restoring a session-holding reader', async () => {
    const { useFeedViewer, render } = await load();
    const { result } = render(() => useFeedViewer(SESSION, true));
    expect(result.current.awaitingIdentityToken).toBe(true);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('stops waiting once Privy has restored and found no session', async () => {
    const { useFeedViewer, render } = await load();
    const { result, rerender } = render(() => useFeedViewer(SESSION, true));
    expect(result.current.awaitingIdentityToken).toBe(true);

    mocks.ready = true;
    rerender();

    expect(result.current.awaitingIdentityToken).toBe(false);
    // The key stays on the session address, so the page already in flight is not refetched.
    expect(result.current.viewerAddress).toBe(SESSION);
  });

  it('keeps the session, and the wait, for a reader Privy has signed in', async () => {
    mocks.ready = true;
    mocks.authenticated = true;
    const { useFeedViewer, render } = await load();
    const { result } = render(() => useFeedViewer(SESSION, true));
    expect(result.current.awaitingIdentityToken).toBe(true);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('does nothing for a reader with no session', async () => {
    mocks.ready = true;
    const { useFeedViewer, render } = await load();
    const { result } = render(() => useFeedViewer(null, true));
    expect(result.current).toEqual({ viewerAddress: null, awaitingIdentityToken: false });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('keys a reader with no session on their account only once the session is synced', async () => {
    mocks.ready = true;
    mocks.authenticated = true;
    mocks.accountAddress = ACCOUNT;
    const { useFeedViewer, render } = await load();
    const { result, rerender } = render(() => useFeedViewer(null, false));
    expect(result.current.viewerAddress).toBeNull();

    mocks.sessionWallet = ACCOUNT;
    rerender();

    expect(result.current.viewerAddress).toBe(ACCOUNT);
  });

  it('keeps a previous viewer’s session as the key until the session is synced', async () => {
    mocks.ready = true;
    mocks.authenticated = true;
    mocks.accountAddress = ACCOUNT;
    const { useFeedViewer, render } = await load();
    const { result, rerender } = render(() => useFeedViewer(SESSION, false));
    expect(result.current.viewerAddress).toBe(SESSION);

    mocks.sessionWallet = ACCOUNT;
    rerender();

    expect(result.current.viewerAddress).toBe(ACCOUNT);
  });

  it('keys on the account straight away when the session already holds it', async () => {
    mocks.ready = true;
    mocks.authenticated = true;
    mocks.accountAddress = SESSION;
    const { useFeedViewer, render } = await load();
    const { result } = render(() => useFeedViewer(SESSION, false));

    expect(result.current.viewerAddress).toBe(SESSION);
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

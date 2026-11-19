import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetWalletSessionClientForTests, syncWalletSession } from '~/core/auth/wallet-session-client';

import {
  WALLET_SESSION_WAIT_MS,
  resetWalletSessionWaitForTests,
  signingAccountDelayMs,
  useSmartAccount,
} from './use-smart-account';

const ADDRESS = '0x5D6d0E45D76D360AB4F94941CE9a005b0AEa2ebD';

const mocks = vi.hoisted(() => ({
  wallets: [] as Array<{ walletClientType: string; address: string }>,
  generateZeroDevAccount: vi.fn(),
  authenticated: true,
}));

vi.mock('~/core/wallet/auth-hooks', () => ({
  usePrivy: () => ({
    ready: true,
    authenticated: mocks.authenticated,
    user: {
      linkedAccounts: [{ type: 'wallet', walletClientType: 'privy', chainType: 'ethereum', address: ADDRESS }],
    },
  }),
  useWallets: () => ({ wallets: mocks.wallets }),
  toViemAccount: async () => ({ address: ADDRESS }),
}));
vi.mock('@geogenesis/auth/account', () => ({
  RevertedUserOperationError: class extends Error {},
  generateZeroDevAccount: mocks.generateZeroDevAccount,
}));
vi.mock('../sdk/geo-network', () => ({ GEO_NETWORK: {} }));

const embedded = { walletClientType: 'privy', address: ADDRESS };

/** The server's session answers for `ADDRESS`, as `WalletSessionSync` would see it. */
async function syncSession(status = 200, body: object = { wallet: ADDRESS.toLowerCase(), status: 'issued' }) {
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify(body), { status }));
  await act(() => syncWalletSession(`token-${status}`, () => {}));
}

function renderSmartAccount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useSmartAccount(), { wrapper });
}

beforeEach(() => {
  mocks.wallets = [];
  mocks.generateZeroDevAccount.mockReset().mockResolvedValue({ account: { address: ADDRESS } });
  resetWalletSessionClientForTests();
  resetWalletSessionWaitForTests();
  mocks.authenticated = true;
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useSmartAccount', () => {
  it('hands the account to writers only once the server session holds the wallet', async () => {
    mocks.wallets = [embedded];
    const { result } = renderSmartAccount();

    await waitFor(() => expect(mocks.generateZeroDevAccount).toHaveBeenCalledOnce());
    await act(async () => {});
    expect(result.current).toEqual(expect.objectContaining({ smartAccount: null, isLoading: true }));

    await syncSession();
    await waitFor(() => expect(result.current.smartAccount?.account.address).toBe(ADDRESS));
    expect(result.current.isLoading).toBe(false);
  });

  it('hands the account over when syncing the session gives up', async () => {
    mocks.wallets = [embedded];
    const { result } = renderSmartAccount();
    await syncSession(503, { wallet: null, status: 'unconfigured' });

    await waitFor(() => expect(result.current.smartAccount?.account.address).toBe(ADDRESS));
  });

  it('hands the account over once the wait for a session runs out', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
    mocks.wallets = [embedded];
    const { result } = renderSmartAccount();

    await act(() => vi.advanceTimersByTimeAsync(WALLET_SESSION_WAIT_MS - 1_000));
    expect(result.current.smartAccount).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(result.current.smartAccount?.account.address).toBe(ADDRESS);
  });

  it('does not restart the wait for a later mount', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
    mocks.wallets = [embedded];
    renderSmartAccount();
    await act(() => vi.advanceTimersByTimeAsync(WALLET_SESSION_WAIT_MS));

    const later = renderSmartAccount();
    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(later.result.current.smartAccount?.account.address).toBe(ADDRESS);
  });

  it('waits afresh for a sign-in after a sign-out on the same page', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
    mocks.wallets = [embedded];
    const { result, rerender } = renderSmartAccount();
    await act(() => vi.advanceTimersByTimeAsync(WALLET_SESSION_WAIT_MS));
    expect(result.current.smartAccount).not.toBeNull();

    mocks.authenticated = false;
    rerender();
    await act(() => vi.advanceTimersByTimeAsync(0));
    mocks.authenticated = true;
    rerender();
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(result.current.smartAccount).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(WALLET_SESSION_WAIT_MS));
    expect(result.current.smartAccount?.account.address).toBe(ADDRESS);
  });

  it('does not rebuild the account when a browser wallet connects', async () => {
    await syncSession();
    mocks.wallets = [embedded];
    const { result, rerender } = renderSmartAccount();
    await waitFor(() => expect(result.current.smartAccount).not.toBeNull());

    mocks.wallets = [{ walletClientType: 'metamask', address: '0x0000000000000000000000000000000000000001' }, embedded];
    rerender();
    await act(async () => {});

    expect(mocks.generateZeroDevAccount).toHaveBeenCalledOnce();
    expect(result.current.smartAccount?.account.address).toBe(ADDRESS);
  });

  it('reports a failed build as an error, not as loading', async () => {
    mocks.generateZeroDevAccount.mockRejectedValue(new Error('zerodev unreachable'));
    mocks.wallets = [embedded];
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderSmartAccount();

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current).toEqual(expect.objectContaining({ smartAccount: null, isLoading: false }));
  });
});

describe('signingAccountDelayMs', () => {
  it('is off when the flag is unset', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(signingAccountDelayMs()).toBe(0);
  });

  it('holds the account back on dev and preview', () => {
    vi.stubEnv('NEXT_PUBLIC_DELAY_SIGNING_ACCOUNT_MS', '30000');
    vi.stubEnv('NODE_ENV', 'development');
    expect(signingAccountDelayMs()).toBe(30_000);

    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'preview');
    expect(signingAccountDelayMs()).toBe(30_000);
  });

  it('is ignored on production', () => {
    vi.stubEnv('NEXT_PUBLIC_DELAY_SIGNING_ACCOUNT_MS', '30000');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production');
    expect(signingAccountDelayMs()).toBe(0);
  });

  it('builds the account only once the delay has passed', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    vi.stubEnv('NEXT_PUBLIC_DELAY_SIGNING_ACCOUNT_MS', '30000');
    vi.stubEnv('NODE_ENV', 'development');
    await syncSession();
    mocks.wallets = [embedded];
    const { result } = renderSmartAccount();

    await act(() => vi.advanceTimersByTimeAsync(29_000));
    expect(mocks.generateZeroDevAccount).not.toHaveBeenCalled();
    expect(result.current.smartAccount).toBeNull();

    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(mocks.generateZeroDevAccount).toHaveBeenCalledOnce();
    await act(() => vi.runOnlyPendingTimersAsync());
    expect(result.current.smartAccount?.account.address).toBe(ADDRESS);
  });
});

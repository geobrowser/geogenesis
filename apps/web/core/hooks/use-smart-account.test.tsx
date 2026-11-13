import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSmartAccount } from './use-smart-account';

const ADDRESS = '0x5D6d0E45D76D360AB4F94941CE9a005b0AEa2ebD';

const mocks = vi.hoisted(() => ({
  wallets: [] as Array<{ walletClientType: string; address: string }>,
  generateZeroDevAccount: vi.fn(),
  syncWalletCookie: vi.fn(),
  forgetSyncedWalletCookie: vi.fn(),
}));

vi.mock('~/core/wallet/auth-hooks', () => ({
  usePrivy: () => ({
    ready: true,
    authenticated: true,
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
vi.mock('../cookie/sync-wallet-cookie', () => ({
  syncWalletCookie: mocks.syncWalletCookie,
  forgetSyncedWalletCookie: mocks.forgetSyncedWalletCookie,
}));
vi.mock('../sdk/geo-network', () => ({ GEO_NETWORK: {} }));

const embedded = { walletClientType: 'privy', address: ADDRESS };

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
  mocks.syncWalletCookie.mockReset().mockResolvedValue(undefined);
  mocks.forgetSyncedWalletCookie.mockReset();
});

afterEach(cleanup);

describe('useSmartAccount', () => {
  it('syncs the wallet cookie from the restored address, before the wallet arrives', async () => {
    const { result } = renderSmartAccount();

    await waitFor(() => expect(mocks.syncWalletCookie).toHaveBeenCalledWith(ADDRESS));
    expect(mocks.generateZeroDevAccount).not.toHaveBeenCalled();
    expect(result.current).toEqual(expect.objectContaining({ smartAccount: null, isLoading: true }));
  });

  it('hands the account to writers only once the cookie sync has landed', async () => {
    let land!: () => void;
    mocks.syncWalletCookie.mockReturnValue(new Promise<void>(resolve => (land = resolve)));
    mocks.wallets = [embedded];
    const { result } = renderSmartAccount();

    await waitFor(() => expect(mocks.generateZeroDevAccount).toHaveBeenCalledOnce());
    await act(async () => {});
    expect(result.current.smartAccount).toBeNull();

    await act(async () => land());
    await waitFor(() => expect(result.current.smartAccount?.account.address).toBe(ADDRESS));
    expect(result.current.isLoading).toBe(false);
  });

  it('hands the account over when the cookie sync fails', async () => {
    mocks.syncWalletCookie.mockRejectedValue(new Error('action not found'));
    mocks.wallets = [embedded];
    const { result } = renderSmartAccount();

    await waitFor(() => expect(result.current.smartAccount?.account.address).toBe(ADDRESS));
  });

  it('does not rebuild the account when a browser wallet connects', async () => {
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

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authenticated: true,
  wallets: [] as Array<{ address: string; walletClientType: string }>,
  createWallet: vi.fn(),
  setActiveWallet: vi.fn(),
}));

vi.mock('@privy-io/react-auth', () => ({
  usePrivy: () => ({ authenticated: mocks.authenticated, user: {} }),
  useWallets: () => ({ wallets: mocks.wallets }),
  useCreateWallet: () => ({ createWallet: mocks.createWallet }),
}));

vi.mock('@privy-io/wagmi', () => ({
  useSetActiveWallet: () => ({ setActiveWallet: mocks.setActiveWallet }),
}));

import { useEnsureEmbeddedWallet } from './use-ensure-embedded-wallet';

const embedded = { address: '0xabc', walletClientType: 'privy' };

beforeEach(() => {
  mocks.authenticated = true;
  mocks.wallets = [];
  mocks.createWallet.mockReset().mockResolvedValue(undefined);
  mocks.setActiveWallet.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/**
 * Nothing here calls `rerender()`.
 *
 * That is the point. The retry this covers was driven by a ref, so it only ever ran again when
 * something else happened to re-render the tree — and a test that rerenders by hand supplies
 * exactly that, which is how a retry that never retried passed its own tests. If a re-run is
 * needed, the hook has to schedule it.
 */
describe('useEnsureEmbeddedWallet', () => {
  it('does nothing while nobody is signed in', async () => {
    mocks.authenticated = false;
    renderHook(() => useEnsureEmbeddedWallet());

    await waitFor(() => expect(mocks.createWallet).not.toHaveBeenCalled());
    expect(mocks.setActiveWallet).not.toHaveBeenCalled();
  });

  it('creates a wallet for an authenticated session that has none', async () => {
    renderHook(() => useEnsureEmbeddedWallet());

    await waitFor(() => expect(mocks.createWallet).toHaveBeenCalledTimes(1));
  });

  it('does not create a second wallet when the session already has one', async () => {
    mocks.wallets = [embedded];
    renderHook(() => useEnsureEmbeddedWallet());

    await waitFor(() => expect(mocks.setActiveWallet).toHaveBeenCalled());
    expect(mocks.createWallet).not.toHaveBeenCalled();
  });

  it('activates the embedded wallet once it exists', async () => {
    mocks.wallets = [embedded];
    renderHook(() => useEnsureEmbeddedWallet());

    await waitFor(() => expect(mocks.setActiveWallet).toHaveBeenCalledWith(embedded));
  });

  it('activates a wallet once, not on every render it survives', async () => {
    mocks.wallets = [embedded];
    renderHook(() => useEnsureEmbeddedWallet());

    await waitFor(() => expect(mocks.setActiveWallet).toHaveBeenCalledTimes(1));
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(mocks.setActiveWallet).toHaveBeenCalledTimes(1);
  });

  describe('when creation fails', () => {
    it('schedules another attempt itself, without anything else re-rendering', async () => {
      vi.useFakeTimers();
      mocks.createWallet.mockRejectedValue(new Error('network'));

      renderHook(() => useEnsureEmbeddedWallet());
      await vi.waitFor(() => expect(mocks.createWallet).toHaveBeenCalledTimes(1));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });

      expect(mocks.createWallet).toHaveBeenCalledTimes(2);
    });

    it('gives up after a bounded number of attempts', async () => {
      vi.useFakeTimers();
      mocks.createWallet.mockRejectedValue(new Error('refused'));

      renderHook(() => useEnsureEmbeddedWallet());
      // Stepped rather than one long jump: each retry only schedules its timer once the previous
      // rejection has settled, so a single advance outruns the chain and undercounts.
      for (let i = 0; i < 5; i++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(2_000);
        });
      }

      expect(mocks.createWallet).toHaveBeenCalledTimes(3);
    });
  });

  describe('when activation fails', () => {
    it('schedules another attempt rather than believing the wallet is active', async () => {
      vi.useFakeTimers();
      mocks.wallets = [embedded];
      mocks.setActiveWallet.mockRejectedValue(new Error('wagmi refused'));

      renderHook(() => useEnsureEmbeddedWallet());
      await vi.waitFor(() => expect(mocks.setActiveWallet).toHaveBeenCalledTimes(1));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });

      expect(mocks.setActiveWallet).toHaveBeenCalledTimes(2);
    });

    it('gives up after a bounded number of attempts', async () => {
      vi.useFakeTimers();
      mocks.wallets = [embedded];
      mocks.setActiveWallet.mockRejectedValue(new Error('refused'));

      renderHook(() => useEnsureEmbeddedWallet());
      // Stepped rather than one long jump: each retry only schedules its timer once the previous
      // rejection has settled, so a single advance outruns the chain and undercounts.
      for (let i = 0; i < 5; i++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(2_000);
        });
      }

      expect(mocks.setActiveWallet).toHaveBeenCalledTimes(3);
    });
  });
});

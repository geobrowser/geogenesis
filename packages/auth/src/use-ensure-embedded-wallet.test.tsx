import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authenticated: true,
  userWallet: undefined as { address: string } | undefined,
  walletsReady: true,
  wallets: [] as Array<{ address: string; walletClientType: string }>,
  createWallet: vi.fn(),
  setActiveWallet: vi.fn(),
}));

vi.mock('@privy-io/react-auth', () => ({
  usePrivy: () => ({ authenticated: mocks.authenticated, user: { wallet: mocks.userWallet } }),
  useWallets: () => ({ wallets: mocks.wallets, ready: mocks.walletsReady }),
  useCreateWallet: () => ({ createWallet: mocks.createWallet }),
}));

vi.mock('@privy-io/wagmi', () => ({
  useSetActiveWallet: () => ({ setActiveWallet: mocks.setActiveWallet }),
}));

import { useEnsureEmbeddedWallet } from './use-ensure-embedded-wallet';

const embedded = { address: '0xabc', walletClientType: 'privy' };

beforeEach(() => {
  mocks.authenticated = true;
  mocks.userWallet = undefined;
  mocks.walletsReady = true;
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

  // The case that hits every existing user on every page load. A restored session flips
  // `authenticated` before `wallets` has hydrated, so there is a window where the list is empty and
  // somebody who has had a wallet for months looks wallet-less. Asking Privy then means a rejection
  // -- it errors when one already exists -- and if hydration outlasts the retry delay, an existing
  // account can spend its whole budget before its own wallet turns up.
  it('waits for the wallet list to hydrate before deciding a session has none', async () => {
    mocks.walletsReady = false;
    const { rerender } = renderHook(() => useEnsureEmbeddedWallet());

    await new Promise(resolve => setTimeout(resolve, 30));
    expect(mocks.createWallet).not.toHaveBeenCalled();

    // Hydration finishes and the wallet was there all along.
    mocks.walletsReady = true;
    mocks.wallets = [embedded];
    rerender();

    await waitFor(() => expect(mocks.setActiveWallet).toHaveBeenCalledWith(embedded));
    expect(mocks.createWallet).not.toHaveBeenCalled();
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

  // Privy hands back new wallet objects for the same address as its state settles. Keyed on the
  // object, that re-ran the effect, whose cleanup marked the in-flight attempt cancelled — so a
  // *successful* activation was thrown away as stale while a second one ran for the same wallet.
  it('does not re-activate when the wallet object changes while activation is still pending', async () => {
    // Pending on purpose. Once activation has resolved the address guard short-circuits anyway, so
    // swapping the object afterwards proves nothing — the damage happens mid-flight, where the
    // effect's cleanup marks the in-flight attempt cancelled and a second one starts.
    let settle: () => void = () => {};
    mocks.setActiveWallet.mockImplementation(() => new Promise<void>(resolve => (settle = resolve)));
    mocks.wallets = [embedded];

    const { rerender } = renderHook(() => useEnsureEmbeddedWallet());
    await waitFor(() => expect(mocks.setActiveWallet).toHaveBeenCalledTimes(1));

    // Same address, new object, exactly as Privy does it as its state settles.
    mocks.wallets = [{ ...embedded }];
    rerender();
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(mocks.setActiveWallet).toHaveBeenCalledTimes(1);

    // And the success still counts: it was not discarded as a cancelled run.
    await act(async () => {
      settle();
    });
    mocks.wallets = [{ ...embedded }];
    rerender();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(mocks.setActiveWallet).toHaveBeenCalledTimes(1);
  });

  // The attempt budget is per address because the target changes. A linked wallet failing three
  // times used to exhaust a session-wide count, and the embedded wallet — the only one
  // `useSmartAccount` can use — then inherited the exhausted budget and was never activated.
  it('gives a newly created wallet its own attempts after another address used up its own', async () => {
    vi.useFakeTimers();
    mocks.userWallet = { address: '0xlinked' };
    mocks.wallets = [{ address: '0xlinked', walletClientType: 'injected' }];
    mocks.setActiveWallet.mockRejectedValue(new Error('refused'));

    const { rerender } = renderHook(() => useEnsureEmbeddedWallet());
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
    }
    const spentOnLinked = mocks.setActiveWallet.mock.calls.length;
    expect(spentOnLinked).toBe(3);

    // The embedded wallet finally appears, and this time activation works.
    mocks.setActiveWallet.mockResolvedValue(undefined);
    mocks.wallets = [{ address: '0xlinked', walletClientType: 'injected' }, embedded];
    rerender();

    await vi.waitFor(() => expect(mocks.setActiveWallet).toHaveBeenCalledWith(embedded));
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

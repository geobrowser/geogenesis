import { act, cleanup, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useWalletStall } from './use-wallet-stall';
import { AUTO_RESTART_MS, RECONNECT_WINDOW_MS, WALLET_STALL_GRACE_MS, WALLET_STALL_RELOAD_KEY } from './wallet-stall';

const mocks = vi.hoisted(() => ({
  wallets: [] as Array<{ walletClientType: string }>,
  linkedAccounts: [] as Array<{ type: string; walletClientType?: string; chainType?: string }>,
  retryEmbeddedWalletSetup: vi.fn(),
  restartAuthHost: vi.fn(),
  invalidateQueries: vi.fn(),
  capture: vi.fn(),
  reload: vi.fn(),
}));

vi.mock('~/core/wallet/auth-hooks', () => ({
  useWallets: () => ({ wallets: mocks.wallets }),
  usePrivy: () => ({ user: { linkedAccounts: mocks.linkedAccounts } }),
  retryEmbeddedWalletSetup: mocks.retryEmbeddedWalletSetup,
  restartAuthHost: mocks.restartAuthHost,
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));
vi.mock('~/core/analytics', () => ({ capture: mocks.capture }));

type Props = { authenticated: boolean; address: string | null; error: unknown };

function setup(initial: Props) {
  return renderHook((props: Props) => useWalletStall(props), { initialProps: initial });
}

function events() {
  return mocks.capture.mock.calls.map(([name, properties]) => ({ name, ...properties }));
}

const signedInNoAccount: Props = { authenticated: true, address: null, error: null };

beforeEach(() => {
  vi.useFakeTimers();
  mocks.wallets = [];
  mocks.linkedAccounts = [{ type: 'wallet', walletClientType: 'privy', chainType: 'ethereum' }];
  mocks.retryEmbeddedWalletSetup.mockReset();
  mocks.restartAuthHost.mockReset();
  mocks.invalidateQueries.mockReset().mockResolvedValue(undefined);
  mocks.capture.mockReset();
  mocks.reload.mockReset();
  sessionStorage.clear();
  vi.stubGlobal('location', { ...window.location, reload: mocks.reload });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useWalletStall', () => {
  it('waits out the grace period before offering Reconnect', () => {
    const { result } = setup(signedInNoAccount);
    expect(result.current.stalled).toBe(false);

    act(() => vi.advanceTimersByTime(WALLET_STALL_GRACE_MS));

    expect(result.current.stalled).toBe(true);
    expect(events()).toEqual([
      expect.objectContaining({
        name: 'wallet_connection_stalled',
        stall_phase: 'shown',
        stall_cause: 'wallet_never_arrived',
        reconnect_attempts: 0,
      }),
    ]);
  });

  it('sends nothing for the ordinary wait inside the grace period', () => {
    const { rerender } = setup(signedInNoAccount);
    act(() => vi.advanceTimersByTime(WALLET_STALL_GRACE_MS - 1));
    rerender({ ...signedInNoAccount, address: '0xabc' });
    act(() => vi.advanceTimersByTime(WALLET_STALL_GRACE_MS));

    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it('never stalls a signed-out visitor', () => {
    const { result } = setup({ authenticated: false, address: null, error: null });
    act(() => vi.advanceTimersByTime(WALLET_STALL_GRACE_MS * 2));

    expect(result.current.stalled).toBe(false);
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it('reports a wallet that turned up late on its own as waiting_for_wallet', () => {
    const { result, rerender } = setup(signedInNoAccount);
    act(() => vi.advanceTimersByTime(WALLET_STALL_GRACE_MS));

    mocks.wallets = [{ walletClientType: 'privy' }];
    rerender({ ...signedInNoAccount, address: '0xabc' });

    expect(result.current.stalled).toBe(false);
    expect(events()[1]).toEqual(
      expect.objectContaining({ stall_phase: 'ended', stall_cause: 'waiting_for_wallet', recovered_by: 'self' })
    );
  });

  it('names a smart-account error, even after a refetch clears it', () => {
    const { rerender } = setup({ ...signedInNoAccount, error: new Error('zerodev') });
    act(() => vi.advanceTimersByTime(WALLET_STALL_GRACE_MS));
    rerender(signedInNoAccount);
    rerender({ ...signedInNoAccount, address: '0xabc' });

    expect(events().map(event => event.stall_cause)).toEqual(['smart_account_error', 'smart_account_error']);
  });

  it('refetches the account and restarts Privy on Reconnect, and reports the recovery', () => {
    const { result, rerender } = setup(signedInNoAccount);
    act(() => vi.advanceTimersByTime(WALLET_STALL_GRACE_MS));

    act(() => result.current.reconnect());

    expect(result.current.reconnecting).toBe(true);
    expect(mocks.restartAuthHost).toHaveBeenCalledTimes(1);
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['smart-account'] });

    mocks.wallets = [{ walletClientType: 'privy' }];
    rerender({ ...signedInNoAccount, address: '0xabc' });
    act(() => vi.advanceTimersByTime(RECONNECT_WINDOW_MS));

    expect(mocks.reload).not.toHaveBeenCalled();
    expect(events()[1]).toEqual(
      expect.objectContaining({
        stall_phase: 'ended',
        stall_cause: 'wallet_never_arrived',
        recovered_by: 'reconnect',
        reconnect_attempts: 1,
      })
    );
  });

  it('reloads once after a Reconnect that did not work, and never again in the tab', () => {
    const { result } = setup(signedInNoAccount);
    act(() => vi.advanceTimersByTime(WALLET_STALL_GRACE_MS));

    act(() => result.current.reconnect());
    act(() => vi.advanceTimersByTime(RECONNECT_WINDOW_MS));

    expect(mocks.reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(WALLET_STALL_RELOAD_KEY)).not.toBeNull();
    expect(events()[1]).toEqual(expect.objectContaining({ stall_phase: 'reloading', reconnect_attempts: 1 }));

    // The page after the reload, still stuck: Reconnect again, and no second reload.
    cleanup();
    const after = setup(signedInNoAccount);
    act(() => vi.advanceTimersByTime(WALLET_STALL_GRACE_MS));
    expect(events()[2]).toEqual(expect.objectContaining({ stall_phase: 'shown', after_reload: true }));

    act(() => after.result.current.reconnect());
    act(() => vi.advanceTimersByTime(RECONNECT_WINDOW_MS));

    expect(mocks.reload).toHaveBeenCalledTimes(1);
    expect(after.result.current.reconnecting).toBe(false);
    expect(after.result.current.stalled).toBe(true);
  });

  it('ignores a second press while a Reconnect is still running', () => {
    const { result } = setup(signedInNoAccount);
    act(() => vi.advanceTimersByTime(WALLET_STALL_GRACE_MS));

    act(() => result.current.reconnect());
    act(() => result.current.reconnect());

    expect(mocks.restartAuthHost).toHaveBeenCalledTimes(1);
  });

  it('leaves Privy alone on Reconnect when the wallet is there, and restarts its wallet setup instead', () => {
    mocks.wallets = [{ walletClientType: 'privy' }];
    const { result } = setup({ ...signedInNoAccount, error: new Error('zerodev') });
    act(() => vi.advanceTimersByTime(WALLET_STALL_GRACE_MS));

    act(() => result.current.reconnect());

    expect(mocks.restartAuthHost).not.toHaveBeenCalled();
    expect(mocks.retryEmbeddedWalletSetup).toHaveBeenCalledTimes(1);
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['smart-account'] });
  });

  it('restarts Privy once on its own after its handshake has given up, and reports that recovery', () => {
    const { rerender } = setup(signedInNoAccount);
    act(() => vi.advanceTimersByTime(AUTO_RESTART_MS - 1));
    expect(mocks.restartAuthHost).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(mocks.restartAuthHost).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(AUTO_RESTART_MS * 2));
    expect(mocks.restartAuthHost).toHaveBeenCalledTimes(1);

    mocks.wallets = [{ walletClientType: 'privy' }];
    rerender({ ...signedInNoAccount, address: '0xabc' });

    expect(events().at(-1)).toEqual(
      expect.objectContaining({
        stall_phase: 'ended',
        stall_cause: 'wallet_never_arrived',
        recovered_by: 'restart',
        privy_restarts: 1,
        reconnect_attempts: 0,
        account_has_wallet: true,
      })
    );
  });

  it('does not restart on its own after a Reconnect already did', () => {
    const { result } = setup(signedInNoAccount);
    act(() => vi.advanceTimersByTime(WALLET_STALL_GRACE_MS));
    act(() => result.current.reconnect());
    sessionStorage.setItem(WALLET_STALL_RELOAD_KEY, '1');

    act(() => vi.advanceTimersByTime(AUTO_RESTART_MS));

    expect(mocks.restartAuthHost).toHaveBeenCalledTimes(1);
  });

  it('does not restart on its own when the wallet is there and only the account is slow', () => {
    mocks.wallets = [{ walletClientType: 'privy' }];
    setup(signedInNoAccount);

    act(() => vi.advanceTimersByTime(AUTO_RESTART_MS));

    expect(mocks.restartAuthHost).not.toHaveBeenCalled();
  });

  it('does not restart on its own while the account has no wallet yet, which Privy may still be creating', () => {
    mocks.linkedAccounts = [];
    setup(signedInNoAccount);

    act(() => vi.advanceTimersByTime(AUTO_RESTART_MS));

    expect(mocks.restartAuthHost).not.toHaveBeenCalled();
  });

  it('reports whether the account has a wallet at all', () => {
    mocks.linkedAccounts = [];
    setup(signedInNoAccount);
    act(() => vi.advanceTimersByTime(WALLET_STALL_GRACE_MS));

    expect(events()[0]).toEqual(expect.objectContaining({ account_has_wallet: false }));
  });
});

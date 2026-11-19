import { act, cleanup, render, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AccountReadinessSync,
  SignedOutBeforeWriteError,
  SigningAccountFailedError,
  accountReadinessState,
  resetPublishedReadiness,
  useAccountReadiness,
  waitForSigningAccount,
} from './account-readiness';

const ADDRESS = '0x5D6d0E45D76D360AB4F94941CE9a005b0AEa2ebD';

const mocks = vi.hoisted(() => ({
  ready: true,
  authenticated: true,
  linkedAccounts: [] as unknown[],
  wallets: [] as Array<{ walletClientType: string }>,
  smartAccount: null as { account: { address: string } } | null,
  error: null as Error | null,
  sessionDetected: true,
  captureExperimental: vi.fn(),
}));

vi.mock('./auth-hooks', () => ({
  usePrivy: () => ({
    ready: mocks.ready,
    authenticated: mocks.authenticated,
    user: { linkedAccounts: mocks.linkedAccounts },
  }),
  useWallets: () => ({ wallets: mocks.wallets }),
}));
vi.mock('./auth-store', () => ({ sessionDetected: () => mocks.sessionDetected }));
vi.mock('~/core/hooks/use-smart-account', () => ({
  useSmartAccount: () => ({ smartAccount: mocks.smartAccount, isLoading: false, error: mocks.error }),
}));
vi.mock('~/core/analytics', () => ({ captureExperimental: mocks.captureExperimental }));

const embeddedWallet = { type: 'wallet', walletClientType: 'privy', chainType: 'ethereum', address: ADDRESS };
const signingAccount = { account: { address: ADDRESS } };

beforeEach(() => {
  mocks.ready = true;
  mocks.authenticated = true;
  mocks.linkedAccounts = [embeddedWallet];
  mocks.wallets = [];
  mocks.smartAccount = null;
  mocks.error = null;
  mocks.sessionDetected = true;
  mocks.captureExperimental.mockReset();
  resetPublishedReadiness();
});

afterEach(cleanup);

describe('accountReadinessState', () => {
  const base = { privyReady: true, authenticated: true, address: ADDRESS, signingAccount: false, buildFailed: false };

  it.each([
    ['restoring while Privy starts', { ...base, privyReady: false, authenticated: false }, 'restoring'],
    ['signed out with no session', { ...base, authenticated: false, address: null }, 'signed_out'],
    ['restoring while a new sign-up has no embedded wallet yet', { ...base, address: null }, 'restoring'],
    ['identified once the address is known', base, 'identified'],
    ['ready to write once the signing account is built', { ...base, signingAccount: true }, 'ready_to_write'],
    ['failed when the build failed', { ...base, buildFailed: true }, 'failed'],
  ] as const)('%s', (_, input, expected) => {
    expect(accountReadinessState(input)).toBe(expected);
  });
});

describe('useAccountReadiness', () => {
  it('knows who the person is from the restored session, before the signing account is built', () => {
    const { result } = renderHook(() => useAccountReadiness());

    expect(result.current).toEqual({ state: 'identified', address: ADDRESS });
  });

  it('keeps the same address once the signing account arrives', () => {
    const { result, rerender } = renderHook(() => useAccountReadiness());
    mocks.smartAccount = { account: { address: ADDRESS.toLowerCase() } };
    rerender();

    expect(result.current).toEqual({ state: 'ready_to_write', address: ADDRESS });
  });

  it('still knows who they are when the build fails', () => {
    mocks.error = new Error('zerodev unreachable');
    const { result } = renderHook(() => useAccountReadiness());

    expect(result.current).toEqual({ state: 'failed', address: ADDRESS });
  });

  it('has no address while restoring or signed out', () => {
    mocks.ready = false;
    const restoring = renderHook(() => useAccountReadiness());
    expect(restoring.result.current).toEqual({ state: 'restoring', address: null });

    mocks.ready = true;
    mocks.authenticated = false;
    const signedOut = renderHook(() => useAccountReadiness());
    expect(signedOut.result.current).toEqual({ state: 'signed_out', address: null });
  });
});

describe('waitForSigningAccount', () => {
  it('waits for the signing account, then hands it over', async () => {
    resetPublishedReadiness({ state: 'identified', address: ADDRESS });
    const waiting = waitForSigningAccount();
    let settled = false;
    void waiting.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);

    mocks.smartAccount = signingAccount;
    render(<AccountReadinessSync />);

    await expect(waiting).resolves.toBe(signingAccount);
  });

  it('gives up once the person turns out to be signed out', async () => {
    const waiting = waitForSigningAccount();
    mocks.authenticated = false;
    render(<AccountReadinessSync />);

    await expect(waiting).rejects.toBeInstanceOf(SignedOutBeforeWriteError);
  });

  it('gives up when the build fails, so the press reports it rather than hanging', async () => {
    const waiting = waitForSigningAccount();
    mocks.error = new Error('zerodev unreachable');
    render(<AccountReadinessSync />);

    await expect(waiting).rejects.toBeInstanceOf(SigningAccountFailedError);
  });
});

describe('load timing', () => {
  const sent = () =>
    mocks.captureExperimental.mock.calls.filter(([name]) => name === 'experimental.account_readiness_timing');

  it('sends each step once the account can write, once per load', () => {
    const view = render(<AccountReadinessSync />);
    mocks.wallets = [{ walletClientType: 'privy' }];
    view.rerender(<AccountReadinessSync />);
    mocks.smartAccount = signingAccount;
    view.rerender(<AccountReadinessSync />);
    view.rerender(<AccountReadinessSync />);

    expect(sent()).toHaveLength(1);
    expect(sent()[0]?.[1]).toEqual(
      expect.objectContaining({
        outcome: 'ready_to_write',
        privy_ready_ms: expect.any(Number),
        identified_ms: expect.any(Number),
        wallet_available_ms: expect.any(Number),
        ready_to_write_ms: expect.any(Number),
      })
    );
  });

  it('reports how far a load got when the page is left first', () => {
    render(<AccountReadinessSync />);
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    expect(sent()[0]?.[1]).toEqual(expect.objectContaining({ outcome: 'left', identified_ms: expect.any(Number) }));
    expect(sent()[0]?.[1]).not.toHaveProperty('ready_to_write_ms');
  });

  it('times nothing for a load that started without a stored session', () => {
    mocks.sessionDetected = false;
    mocks.smartAccount = signingAccount;
    render(<AccountReadinessSync />);

    expect(sent()).toHaveLength(0);
  });
});

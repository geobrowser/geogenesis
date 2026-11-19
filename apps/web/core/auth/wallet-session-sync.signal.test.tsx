import { act, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { forgetWalletSession, resetWalletSessionClientForTests, syncWalletSession } from './wallet-session-client';
import { useWalletSessionSync } from './wallet-session-sync';

vi.mock('~/core/auth/identity-token', () => ({
  getCachedIdentityToken: async () => 'fresh',
  setCachedIdentityToken: () => {},
  useIdentityTokenSync: () => null,
}));
vi.mock('~/core/wallet/auth-hooks', () => ({ usePrivy: () => ({ ready: true, authenticated: true, user: null }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

const WALLET = '0x' + 'a'.repeat(40);
const respond = (status: number, body: object) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

beforeEach(() => resetWalletSessionClientForTests());
afterEach(() => vi.unstubAllGlobals());

describe('useWalletSessionSync', () => {
  it('turns synced for the wallet the server answered with, and back on sign-out', async () => {
    vi.stubGlobal('fetch', respond(200, { wallet: WALLET, status: 'issued' }));
    const { result } = renderHook(() => useWalletSessionSync(WALLET.toUpperCase().replace('0X', '0x')));
    expect(result.current).toEqual({ synced: false, settled: false });

    await act(() => syncWalletSession('t1', () => {}));
    expect(result.current).toEqual({ synced: true, settled: true });

    act(() => forgetWalletSession());
    expect(result.current).toEqual({ synced: false, settled: false });
  });

  it('is not synced for another wallet, but settles once syncing gives up', async () => {
    vi.stubGlobal('fetch', respond(503, { wallet: null, status: 'unconfigured' }));
    const { result } = renderHook(() => useWalletSessionSync(WALLET));

    await act(() => syncWalletSession('t1', () => {}));
    expect(result.current).toEqual({ synced: false, settled: true });
  });
});

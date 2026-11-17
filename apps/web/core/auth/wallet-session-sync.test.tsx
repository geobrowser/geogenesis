import { render } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WalletSessionSync } from './wallet-session-sync';

const mocks = vi.hoisted(() => ({
  privy: { ready: true, authenticated: true },
  identityToken: 'token' as string | null,
  getToken: vi.fn(async () => 'fetched' as string | null),
  sync: vi.fn(async () => {}),
  clear: vi.fn(async () => {}),
  forget: vi.fn(),
  hint: false,
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('~/core/wallet/auth-hooks', () => ({ usePrivy: () => mocks.privy }));
vi.mock('~/core/auth/identity-token', () => ({
  useIdentityTokenSync: () => mocks.identityToken,
  getCachedIdentityToken: mocks.getToken,
}));
vi.mock('./wallet-session-client', () => ({
  syncWalletSession: mocks.sync,
  clearWalletSession: mocks.clear,
  forgetWalletSession: mocks.forget,
  hasWalletSessionHint: () => mocks.hint,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.privy = { ready: true, authenticated: true };
  mocks.identityToken = 'token';
  mocks.hint = false;
});

describe('WalletSessionSync', () => {
  it("posts Privy's identity token, without waiting on the smart account", () => {
    render(<WalletSessionSync />);
    expect(mocks.sync).toHaveBeenCalledWith('token', expect.any(Function));
  });

  it('posts again when Privy reissues the token', () => {
    const { rerender } = render(<WalletSessionSync />);
    mocks.identityToken = 'reissued';
    rerender(<WalletSessionSync />);
    expect(mocks.sync).toHaveBeenLastCalledWith('reissued', expect.any(Function));
  });

  it('asks for a token when Privy is signed in but has not published one', async () => {
    mocks.identityToken = null;
    render(<WalletSessionSync />);
    await vi.waitFor(() => expect(mocks.sync).toHaveBeenCalledWith('fetched', expect.any(Function)));
  });

  it('does nothing while Privy is restoring', () => {
    mocks.privy = { ready: false, authenticated: false };
    mocks.hint = true;
    render(<WalletSessionSync />);
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
  });

  it('clears a session Privy no longer has', () => {
    mocks.privy = { ready: true, authenticated: false };
    mocks.hint = true;
    render(<WalletSessionSync />);
    expect(mocks.clear).toHaveBeenCalledOnce();
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it('sends nothing for a signed-out visitor with no session', () => {
    mocks.privy = { ready: true, authenticated: false };
    render(<WalletSessionSync />);
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(mocks.forget).toHaveBeenCalled();
  });

  it('refreshes through the router', () => {
    render(<WalletSessionSync />);
    const refresh = (mocks.sync.mock.calls[0] as unknown as [string, () => void])[1];
    refresh();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});

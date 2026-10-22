import { afterEach, describe, expect, it, vi } from 'vitest';

import { type PrivyValue, type WalletsValue, getState, publish, resetAuthStore, restartAuthHost } from './auth-store';

const privy = (ready: boolean, authenticated: boolean) => ({ ready, authenticated }) as unknown as PrivyValue;
const wallets = (count: number) =>
  ({ wallets: Array.from({ length: count }, () => ({})), ready: true }) as unknown as WalletsValue;

afterEach(() => {
  resetAuthStore();
  vi.useRealTimers();
});

describe('restartAuthHost', () => {
  it("holds the last host's values until the new one is ready, so the app never reads a sign-out", () => {
    const signedIn = privy(true, true);
    const before = wallets(0);
    publish('privy', signedIn);
    publish('wallets', before);

    restartAuthHost();
    expect(getState().hostKey).toBe(1);

    // A fresh Privy starts out not ready and signed out.
    publish('privy', privy(false, false));
    publish('wallets', wallets(0));
    expect(getState().privy).toBe(signedIn);
    expect(getState().wallets).toBe(before);

    const restarted = privy(true, true);
    const after = wallets(1);
    publish('privy', restarted);
    publish('wallets', after);

    expect(getState().restarting).toBe(false);
    expect(getState().privy).toBe(restarted);
    expect(getState().wallets).toBe(after);
  });

  it('lets a fresh Privy that comes up signed out say so', () => {
    publish('privy', privy(true, true));
    restartAuthHost();

    const signedOut = privy(true, false);
    publish('privy', signedOut);

    expect(getState().privy).toBe(signedOut);
  });

  it('stops holding after a while if the new host never reports ready', () => {
    vi.useFakeTimers();
    publish('privy', privy(true, true));
    restartAuthHost();

    const stuck = privy(false, false);
    publish('privy', stuck);
    vi.advanceTimersByTime(19_999);
    expect(getState().restarting).toBe(true);

    vi.advanceTimersByTime(1);
    expect(getState().restarting).toBe(false);
    publish('privy', stuck);
    expect(getState().privy).toBe(stuck);
  });

  it('lets a later restart keep its own hold when an earlier one times out', () => {
    vi.useFakeTimers();
    publish('privy', privy(true, true));
    restartAuthHost();
    vi.advanceTimersByTime(10_000);
    restartAuthHost();

    vi.advanceTimersByTime(10_000);
    expect(getState().restarting).toBe(true);
  });

  it('holds nothing back when no host had published yet', () => {
    restartAuthHost();
    const loading = privy(false, false);
    publish('privy', loading);

    expect(getState().restarting).toBe(false);
    expect(getState().privy).toBe(loading);
  });
});

import { afterEach, describe, expect, it } from 'vitest';

import { type PrivyValue, type WalletsValue, getState, publish, resetAuthStore, restartAuthHost } from './auth-store';

const privy = (ready: boolean, authenticated: boolean) => ({ ready, authenticated }) as unknown as PrivyValue;
const wallets = (count: number) =>
  ({ wallets: Array.from({ length: count }, () => ({})), ready: true }) as unknown as WalletsValue;

afterEach(() => resetAuthStore());

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

  it('holds nothing back when no host had published yet', () => {
    restartAuthHost();
    const loading = privy(false, false);
    publish('privy', loading);

    expect(getState().restarting).toBe(false);
    expect(getState().privy).toBe(loading);
  });
});

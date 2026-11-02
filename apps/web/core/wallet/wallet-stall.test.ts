import { describe, expect, it } from 'vitest';

import { afterFailedReconnect, navbarAccountState, walletStallCause } from './wallet-stall';

const base = { authenticated: false, isLoading: false, hasAddress: false, hasHeldIdentity: false, stalled: false };

describe('navbarAccountState', () => {
  it('is signed out only for someone Privy does not have signed in', () => {
    expect(navbarAccountState(base)).toBe('signed_out');
  });

  // GEO-3245: this is the state that used to render Log in.
  it('never reads signed in with no account as signed out', () => {
    expect(navbarAccountState({ ...base, authenticated: true })).toBe('loading');
    expect(navbarAccountState({ ...base, authenticated: true, stalled: true })).toBe('stalled');
  });

  it('offers Reconnect even while the smart account still says it is loading', () => {
    expect(navbarAccountState({ ...base, authenticated: true, isLoading: true, stalled: true })).toBe('stalled');
  });

  it('shows the account once there is an address', () => {
    expect(navbarAccountState({ ...base, authenticated: true, hasAddress: true })).toBe('account');
  });

  it('keeps the held identity through a mid-session re-resolve', () => {
    expect(
      navbarAccountState({ ...base, authenticated: true, isLoading: true, hasAddress: true, hasHeldIdentity: true })
    ).toBe('account');
  });

  it('loads while an address is resolved but its profile is not', () => {
    expect(navbarAccountState({ ...base, authenticated: true, isLoading: true, hasAddress: true })).toBe('loading');
  });

  it('loads on a cold start before Privy has decided', () => {
    expect(navbarAccountState({ ...base, isLoading: true })).toBe('loading');
  });
});

describe('walletStallCause', () => {
  it('names an error first, even once the wallet is there', () => {
    expect(walletStallCause({ hadError: true, hasEmbeddedWallet: true, resolvedOnItsOwn: true })).toBe(
      'smart_account_error'
    );
  });

  it('is a wallet that never arrived while nothing is connected', () => {
    expect(walletStallCause({ hadError: false, hasEmbeddedWallet: false, resolvedOnItsOwn: false })).toBe(
      'wallet_never_arrived'
    );
  });

  it('is a late wallet when the account came on its own, or the wallet is there and building', () => {
    expect(walletStallCause({ hadError: false, hasEmbeddedWallet: false, resolvedOnItsOwn: true })).toBe(
      'waiting_for_wallet'
    );
    expect(walletStallCause({ hadError: false, hasEmbeddedWallet: true, resolvedOnItsOwn: false })).toBe(
      'waiting_for_wallet'
    );
  });
});

describe('afterFailedReconnect', () => {
  it('reloads once, then only offers Reconnect again', () => {
    expect(afterFailedReconnect(false)).toBe('reload');
    expect(afterFailedReconnect(true)).toBe('retry_again');
  });
});

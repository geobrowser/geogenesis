import { describe, expect, it, vi } from 'vitest';

import { privyConfig } from './privy';

vi.mock('@geogenesis/auth', () => ({ PrivyProvider: () => null }));

/**
 * Sign-ins that finish in the page they started on. A visitor's press before signing up — a vote, a
 * join, "I'm interested" — is queued in memory and replayed once their account exists. A method that
 * redirects away (any OAuth provider: google, apple, twitter, discord, github, …) reloads the page,
 * and the press is gone with no sign it ever happened.
 */
const SAME_DOCUMENT_LOGIN_METHODS = ['email', 'sms', 'wallet', 'passkey'];

describe('Privy login methods', () => {
  // Fails when a redirecting method is added, so whoever adds it sees that the pending-actions queue
  // has to survive the redirect first (move it to sessionStorage and rebuild handlers on return).
  it('only allows sign-ins that stay in the page, which the in-memory action queue relies on', () => {
    const methods = privyConfig.loginMethods ?? [];

    expect(methods.length).toBeGreaterThan(0);
    expect(methods.filter(method => !SAME_DOCUMENT_LOGIN_METHODS.includes(method))).toEqual([]);
  });
});

describe('Privy wallet list', () => {
  // Privy fetches explorer-api.walletconnect.com/v3/wallets on every page load when any of these is listed.
  // Mirrors Privy 3.32.2's registry slugs; re-check on Privy upgrades.
  const REGISTRY_WALLETS = [
    'wallet_connect',
    'backpack',
    'binance',
    'binanceus',
    'bitget_wallet',
    'bybit_wallet',
    'cryptocom',
    'haha_wallet',
    'jupiter',
    'metamask',
    'okx_wallet',
    'phantom',
    'rabby_wallet',
    'rainbow',
    'ronin_wallet',
    'safe',
    'solflare',
    'uniswap',
    'zerion',
    'kraken_wallet',
  ];

  it('names no WalletConnect registry wallet, so the registry is not fetched on mount', () => {
    const list = privyConfig.appearance?.walletList;

    expect(list).toBeDefined();
    expect(list!.filter(entry => REGISTRY_WALLETS.includes(entry))).toEqual([]);
  });
});

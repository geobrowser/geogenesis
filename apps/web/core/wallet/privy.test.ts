import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { privyConfig } from './privy';

vi.mock('@geogenesis/auth', () => ({ PrivyProvider: () => null }));

/**
 * Sign-ins that finish in the page they started on. A visitor's press before signing up — a vote, a
 * join, "I'm interested" — is queued in memory and replayed once their account exists. A method that
 * redirects away (any OAuth provider: google, apple, twitter, discord, github, …) reloads the page and
 * drops the press, so redirect methods stay out of the config and are offered only behind the
 * `googleSignIn` flag, which accepts that loss.
 */
const SAME_DOCUMENT_LOGIN_METHODS = ['email', 'sms', 'wallet', 'passkey'];

describe('Privy login methods', () => {
  it('keeps redirecting methods out of the default config', () => {
    const methods = privyConfig.loginMethods ?? [];

    expect(methods.length).toBeGreaterThan(0);
    expect(methods.filter(method => !SAME_DOCUMENT_LOGIN_METHODS.includes(method))).toEqual([]);
  });

  // `useTrackedLogin` is the one place Privy's login() is called and `google-oauth.tsx` the one place a
  // headless OAuth starts; the `googleSignIn` flag is the only thing that turns either on. Fails when
  // another file opens a login, starts OAuth, reads the flag, or adds login methods.
  it('offers redirect methods only behind the googleSignIn flag', () => {
    const files = appSources();
    const using = (pattern: RegExp) => files.filter(file => pattern.test(file.source)).map(file => file.path);
    // The wrappers in `auth-hooks.ts` and the Privy chunk that runs the real hooks.
    const callers = (pattern: RegExp) => using(pattern).filter(path => !AUTH_LAYER.includes(path));

    expect(callers(/useGeoLogin\(/)).toEqual(['core/hooks/use-tracked-login.ts']);
    expect(using(/= useGoogleSignInOptions\(/)).toEqual(['core/hooks/use-tracked-login.ts']);
    expect(using(/useFeatureFlag\('googleSignIn'\)/)).toEqual(['core/auth/google-sign-in.ts']);
    expect(callers(/usePrivyLogin\(/)).toEqual(['core/privy-auth-tracker.tsx']);
    expect(callers(/useLoginWithOAuth|initOAuth/)).toEqual(['core/auth/google-oauth.tsx']);
    expect(using(/useGoogleSignInEnabled\(/).sort()).toEqual([
      'core/auth/google-oauth.tsx',
      'core/auth/google-sign-in.ts',
    ]);
    expect(using(/useGoogleSignInOffered\(/).sort()).toEqual([
      'core/auth/google-oauth.tsx',
      'core/auth/google-sign-in.ts',
    ]);
    expect(using(/= useGoogleOAuthSignIn\(/)).toEqual(['partials/explore/email-capture-popup.tsx']);
    expect(using(/useLinkWithOAuth/)).toEqual([]);
    expect(using(/from '@privy-io\/react-auth'/)).toEqual([]);
    expect(using(/loginMethods/).sort()).toEqual(['core/auth/google-sign-in.ts', 'core/wallet/privy.tsx']);
  });
});

const AUTH_LAYER = ['core/wallet/auth-hooks.ts', 'core/wallet/privy-host.tsx'];

/** App source files, tests and build output excluded, with paths relative to apps/web. */
function appSources() {
  const root = join(__dirname, '../..');
  const skip = new Set(['node_modules', '.next', 'out', 'coverage', 'public']);
  const files: { path: string; source: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!skip.has(entry.name) && !entry.name.startsWith('.')) walk(path);
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$|\.d\.ts$/.test(entry.name)) {
        files.push({ path: relative(root, path), source: readFileSync(path, 'utf8') });
      }
    }
  };
  walk(root);
  return files;
}

describe('Privy wallet list', () => {
  // Listing any of these makes Privy fetch explorer-api.walletconnect.com/v3/wallets on every page load.
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

  // Registry wallets are off because nothing signs in with or picks a wallet. Fails when wallet login
  // is added, so whoever adds it lists the wallets it needs and accepts the fetch.
  it('keeps registry wallets off while sign-in has no wallet method', () => {
    const list = privyConfig.appearance?.walletList;

    expect(privyConfig.loginMethods).not.toContain('wallet');
    expect(list).toBeDefined();
    expect(list!.filter(entry => REGISTRY_WALLETS.includes(entry))).toEqual([]);
  });
});

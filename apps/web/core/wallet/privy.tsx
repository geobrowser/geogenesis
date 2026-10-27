'use client';

import { PrivyProvider as Privy, PrivyClientConfig } from '@geogenesis/auth';

import * as React from 'react';

import { GEOGENESIS } from './geo-chain';

/** Exported for the test that pins `loginMethods` to sign-ins that stay in the page. */
export const privyConfig: PrivyClientConfig = {
  // Session refresh calls auth.privy.io; TimeoutError usually means the host cannot reach Privy
  // (firewall/VPN/DNS). Not configurable here—fix network or use Privy dashboard allowed origins.
  defaultChain: GEOGENESIS,
  supportedChains: [GEOGENESIS],
  // Every method here completes in the same document. Actions a visitor takes before signing up are
  // queued in memory (`core/state/pending-actions.ts`), and a method that redirects away — any OAuth
  // provider — reloads the page and drops them. Google is added per call behind the `googleSignIn`
  // flag (`core/auth/google-sign-in.ts`), which accepts that loss. `privy.test.ts` holds this.
  loginMethods: ['email'],
  embeddedWallets: {
    ethereum: {
      // Auto-provision a Privy embedded EOA on login. Required for the ZeroDev
      // EIP-7702 flow — the embedded EOA is the signer; without it `useSmartAccount`
      // resolves null forever and every write path fails as if logged out.
      // 'all-users' (not 'users-without-wallets') because a user with a linked
      // external wallet from the pre-migration era otherwise never gets an
      // embedded wallet and is permanently bricked.
      createOnLogin: 'all-users',
    },
    showWalletUIs: false,
  },
  appearance: {
    showWalletLoginFirst: false,
    // Listing a registry wallet (wallet_connect, metamask, rainbow, …; Privy's default list does)
    // makes Privy fetch the WalletConnect registry (~170 KB) on mount. Sign-in is email only and no
    // wallet picker opens, so registry wallets and the WalletConnect/Coinbase connectors are off.
    // Adding a wallet picker means listing them again and accepting the fetch.
    walletList: ['detected_ethereum_wallets'],
    logo: '/static/favicon-320x180.png',
  },
};

export function PrivyProvider({ children }: { children: React.ReactNode }) {
  return (
    <Privy appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!} config={privyConfig}>
      {children}
    </Privy>
  );
}

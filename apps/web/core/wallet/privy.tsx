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
  // Every method here has to complete in the same document. Actions a visitor takes before signing
  // up are queued in memory (`core/state/pending-actions.ts`) and replayed once their account exists;
  // a method that redirects away — any OAuth provider — reloads the page and silently drops them.
  // Adding one means persisting that queue across the redirect first. `privy.test.ts` holds this.
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

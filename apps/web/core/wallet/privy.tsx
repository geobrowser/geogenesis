'use client';

import { PrivyProvider as Privy, PrivyClientConfig } from '@geogenesis/auth';

import * as React from 'react';

import { GEOGENESIS } from './geo-chain';

const config: PrivyClientConfig = {
  // Session refresh calls auth.privy.io; TimeoutError usually means the host cannot reach Privy
  // (firewall/VPN/DNS). Not configurable here—fix network or use Privy dashboard allowed origins.
  defaultChain: GEOGENESIS,
  supportedChains: [GEOGENESIS],
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
    <Privy appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!} config={config}>
      {children}
    </Privy>
  );
}

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
      // Auto-provision a Privy embedded EOA on email/social login if the user doesn't
      // already have one. Required for the ZeroDev EIP-7702 flow — the embedded EOA is
      // the signer; without it `useWalletClient` returns undefined and `useSmartAccount`
      // never resolves, leaving the navbar stuck on "Log in".
      createOnLogin: 'users-without-wallets',
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

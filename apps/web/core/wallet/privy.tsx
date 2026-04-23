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

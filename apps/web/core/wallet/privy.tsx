'use client';

import { PrivyProvider as Privy, PrivyClientConfig } from '@privy-io/react-auth';

import * as React from 'react';

import { GEOGENESIS } from './conduit-chain';

const config: PrivyClientConfig = {
  defaultChain: GEOGENESIS,
  supportedChains: [GEOGENESIS],
  loginMethods: ['email'],
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

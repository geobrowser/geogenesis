'use client';

import { PrivyProvider as Privy, PrivyClientConfig } from '@privy-io/react-auth';

import * as React from 'react';

import { Environment } from '../environment';
import { GEOGENESIS } from './geo-chain';

const config: PrivyClientConfig = {
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
    <Privy appId={Environment.variables.privyAppId} config={config}>
      {children}
    </Privy>
  );
}

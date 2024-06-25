'use client';

import { PrivyProvider as Privy, PrivyClientConfig } from '@privy-io/react-auth';

import * as React from 'react';

import { CONDUIT_TESTNET } from './conduit-chain';

const config: PrivyClientConfig = {
  defaultChain: CONDUIT_TESTNET,
  supportedChains: [CONDUIT_TESTNET],
  // embeddedWallets: {
  // noPromptOnSignature: false,
  // createOnLogin: 'users-without-wallets',
  // },
  appearance: {
    showWalletLoginFirst: false,
    logo: '/static/favicon-320x180.png',
    walletList: ['rainbow', 'coinbase_wallet', 'wallet_connect', 'metamask'],
  },
};

export function PrivyProvider({ children }: { children: React.ReactNode }) {
  return (
    <Privy appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!} config={config}>
      {children}
    </Privy>
  );
}

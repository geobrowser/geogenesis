'use client';

import { WagmiProvider } from '@geogenesis/auth';
import { createGeoWalletConfig, createMockConfig } from '@geogenesis/auth/wallet';

import * as React from 'react';

import { Environment } from '../environment';
import { GEOGENESIS } from './geo-chain';

const isTestEnv = Environment.variables.isTestEnv;

// Chain identity comes from the shared env-driven config (see
// ~/core/wallet/geo-chain), never a hardcoded network literal.
const CHAIN = GEOGENESIS;

const realWalletConfig = createGeoWalletConfig({
  chain: CHAIN,
  rpcUrl: Environment.getConfig().rpc,
  walletConnectProjectId: Environment.variables.walletConnectProjectId,
});

const mockConfig = createMockConfig(CHAIN);

const activeConfig = isTestEnv ? mockConfig : realWalletConfig;

const config = activeConfig as unknown as React.ComponentProps<typeof WagmiProvider>['config'];

/** Only `privy-host.tsx` imports this, so wagmi and its connectors load with Privy, not with the page. */
export function WalletProvider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider reconnectOnMount config={config}>
      {children}
    </WagmiProvider>
  );
}

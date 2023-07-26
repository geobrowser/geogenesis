'use client';

import * as React from 'react';
import { ConnectKitButton, ConnectKitProvider, getDefaultClient } from 'connectkit';
import { Chain, configureChains, createClient, useDisconnect, WagmiConfig } from 'wagmi';
import { polygon, polygonMumbai } from 'wagmi/chains';
import { publicProvider } from 'wagmi/providers/public';

import { Config } from './config';
import { Spacer } from './design-system/spacer';
import { Wallet } from './design-system/icons/wallet';
import { DisconnectWallet } from './design-system/icons/disconnect-wallet';
import { Button } from './design-system/button';

const LOCAL_CHAIN: Chain = {
  id: Number(Config.options.development.chainId),
  name: 'Geo Genesis Dev', // Human-readable name
  network: 'ethereum', // Internal network name
  nativeCurrency: {
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [Config.options.development.rpc],
    },
    public: {
      http: [Config.options.development.rpc],
    },
  },
};

const TESTNET_CHAIN: Chain = {
  ...polygonMumbai,
  rpcUrls: {
    default: {
      http: [Config.options.testnet.rpc],
    },
    public: {
      http: [Config.options.testnet.rpc],
    },
  },
};

const DEFAULT_CHAIN: Chain = {
  ...polygon,
  rpcUrls: {
    default: {
      http: [Config.options.production.rpc],
    },
    public: {
      http: [Config.options.production.rpc],
    },
  },
};

const { chains, provider, webSocketProvider } = configureChains(
  // Only make the dev chains available in development
  [DEFAULT_CHAIN, ...(process.env.NODE_ENV === 'development' ? [TESTNET_CHAIN, LOCAL_CHAIN] : [])],
  [publicProvider()]
);

const wagmiClient = createClient(
  getDefaultClient({
    appName: 'Geo Genesis',
    chains,
    webSocketProvider,
    provider,
    autoConnect: true,
    walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
  })
);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiConfig client={wagmiClient}>
      <ConnectKitProvider>{children}</ConnectKitProvider>
    </WagmiConfig>
  );
}

export function GeoConnectButton() {
  // There's currently no mechanisms in connectkit to handle disconnecting their APIs
  // without going through the modal. It uses wagmi internally so we can escape-hatch
  // into wagmi-land to disconnect.
  const { disconnect } = useDisconnect();

  return (
    <ConnectKitButton.Custom>
      {({ show, isConnected }) => {
        if (!isConnected) {
          return (
            <Button onClick={show} variant="secondary">
              <Wallet />
              Connect
            </Button>
          );
        }

        return (
          // We're using an anonymous function for disconnect to appease the TS gods.
          <button
            onClick={isConnected ? () => disconnect() : show}
            className="m-0 flex w-full cursor-pointer items-center border-none bg-transparent p-0"
          >
            <DisconnectWallet />
            <Spacer width={8} />
            <p className="text-button">Disconnect</p>
          </button>
        );
      }}
    </ConnectKitButton.Custom>
  );
}

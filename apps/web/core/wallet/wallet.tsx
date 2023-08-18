'use client';

import { ConnectKitButton, ConnectKitProvider, getDefaultConfig } from 'connectkit';
import { createPublicClient, createWalletClient, http } from 'viem';

import * as React from 'react';

import { Chain, WagmiConfig, configureChains, createConfig, useConnect, useDisconnect } from 'wagmi';
import { polygon, polygonMumbai } from 'wagmi/chains';
import { CoinbaseWalletConnector } from 'wagmi/connectors/coinbaseWallet';
import { InjectedConnector } from 'wagmi/connectors/injected';
import { MetaMaskConnector } from 'wagmi/connectors/metaMask';
import { MockConnector } from 'wagmi/connectors/mock';
import { WalletConnectConnector } from 'wagmi/connectors/walletConnect';
import { alchemyProvider } from 'wagmi/providers/alchemy';
import { publicProvider } from 'wagmi/providers/public';

import { Button } from '~/design-system/button';
import { DisconnectWallet } from '~/design-system/icons/disconnect-wallet';
import { Wallet } from '~/design-system/icons/wallet';
import { Spacer } from '~/design-system/spacer';

import { Environment } from '../environment';

const LOCAL_CHAIN: Chain = {
  id: Number(Environment.options.development.chainId),
  name: 'Geo Genesis Dev', // Human-readable name
  network: 'ethereum', // Internal network name
  nativeCurrency: {
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [Environment.options.development.rpc],
    },
    public: {
      http: [Environment.options.development.rpc],
    },
  },
};

const { chains, publicClient, webSocketPublicClient } = configureChains(
  [
    polygon,
    // Only make the dev chains available in development
    ...(process.env.NODE_ENV === 'development' ? [polygonMumbai, LOCAL_CHAIN] : []),
  ],
  [
    alchemyProvider({ apiKey: process.env.NEXT_PUBLIC_ALCHEMY_API_KEY! }),
    // We need to use another provider if using a local chain
    ...(process.env.NODE_ENV === 'development' ? [publicProvider()] : []),
  ]
);

const getMockWalletClient = () =>
  createWalletClient({
    transport: http(polygon.rpcUrls.default.http[0]),
    chain: polygon,
    account: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    key: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    pollingInterval: 100,
  });

const getMockPublicClient = () => {
  return createPublicClient({
    transport: http(polygon.rpcUrls.default.http[0]),
    chain: polygon,
    pollingInterval: 100,
  });
};

const createRealWalletConfig = () => {
  return createConfig({
    publicClient,
    webSocketPublicClient,
    autoConnect: true,
    connectors: [
      new MetaMaskConnector({
        chains,
        options: {
          shimDisconnect: true,
          UNSTABLE_shimOnConnectSelectAccount: true,
        },
      }),
      new CoinbaseWalletConnector({
        chains,
        options: {
          appName: 'Geo Genesis',
          headlessMode: true,
        },
      }),
      new WalletConnectConnector({
        chains,
        options: {
          showQrModal: false,
          projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
          metadata: {
            name: 'Geo Genesis',
            description: "Browse and organize the world's public knowledge and information in a decentralized way.",
            url: 'https://geobrowser.io',
            icons: ['/static/favicon.png'],
          },
        },
      }),
      new InjectedConnector({
        chains,
        options: {
          shimDisconnect: true,
          name: detectedName =>
            `Injected (${typeof detectedName === 'string' ? detectedName : detectedName.join(', ')})`,
        },
      }),
    ],
  });
};

const mockConnector = new MockConnector({
  chains,
  options: { chainId: polygon.id, walletClient: getMockWalletClient() },
});

const createMockWalletConfig = () => {
  return createConfig(
    getDefaultConfig({
      connectors: [mockConnector],
      appName: 'Geo Genesis',
      chains,
      publicClient: getMockPublicClient(),
      autoConnect: false,
      walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
    })
  );
};

const isTestEnv = process.env.NEXT_PUBLIC_IS_TEST_ENV === 'true';

const wagmiConfig = isTestEnv ? createMockWalletConfig() : createRealWalletConfig();

export function WalletProvider({ children }: { children: React.ReactNode }) {
  return (
    // @ts-expect-error not sure why wagmi isn't happy. It works at runtime as expected.
    <WagmiConfig config={wagmiConfig}>
      <ConnectKitProvider>{children}</ConnectKitProvider>
    </WagmiConfig>
  );
}

export function GeoConnectButton() {
  // There's currently no mechanisms in connectkit to handle disconnecting their APIs
  // without going through the modal. It uses wagmi internally so we can escape-hatch
  // into wagmi-land to disconnect.
  const { disconnect } = useDisconnect();
  const { connect } = useConnect();

  return (
    <ConnectKitButton.Custom>
      {({ show, isConnected }) => {
        if (!isConnected) {
          return (
            <Button
              onClick={
                isTestEnv
                  ? () => {
                      console.log('Test environment detected: using mock wallet');

                      connect({
                        connector: mockConnector,
                        chainId: polygon.id,
                      });
                    }
                  : show
              }
              variant="secondary"
            >
              <Wallet />
              Connect
            </Button>
          );
        }

        return (
          // We're using an anonymous function for disconnect to appease the TS gods.
          <button
            onClick={() => disconnect()}
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

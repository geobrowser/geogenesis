'use client';

import { ConnectKitButton, ConnectKitProvider, getDefaultConfig } from 'connectkit';
import { createPublicClient, createWalletClient, http } from 'viem';

import * as React from 'react';

import { Chain, WagmiConfig, configureChains, createConfig, useConnect, useDisconnect } from 'wagmi';
import { goerli, polygon, polygonMumbai } from 'wagmi/chains';
import { CoinbaseWalletConnector } from 'wagmi/connectors/coinbaseWallet';
import { InjectedConnector } from 'wagmi/connectors/injected';
import { MetaMaskConnector } from 'wagmi/connectors/metaMask';
import { MockConnector } from 'wagmi/connectors/mock';
import { WalletConnectConnector } from 'wagmi/connectors/walletConnect';
import { jsonRpcProvider } from 'wagmi/providers/jsonRpc';
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
    ...(process.env.NODE_ENV !== 'production' ? [polygonMumbai, LOCAL_CHAIN] : []),
  ],
  [
    jsonRpcProvider({
      rpc: (chain: Chain): { http: string; webSocket?: string } => {
        if (chain.id === polygon.id) {
          return {
            http: process.env.NEXT_PUBLIC_RPC_URL!,
            webSocket: process.env.NEXT_PUBLIC_WSS_URL!,
          };
        }

        if (chain.id === polygonMumbai.id) {
          return {
            http: polygonMumbai.rpcUrls.default.http[0],
          };
        }

        if (chain.id === LOCAL_CHAIN.id) {
          return {
            http: LOCAL_CHAIN.rpcUrls.default.http[0],
          };
        }

        return {
          http: polygon.rpcUrls.default.http[0],
        };
      },
    }),
    // We need to use another provider if using a local chain
    ...(process.env.NEXT_PUBLIC_APP_ENV === 'development' ? [publicProvider()] : []),
  ]
);

const getMockWalletClient = () =>
  createWalletClient({
    transport: http(polygon.rpcUrls.default.http[0]),
    chain: polygon,
    account: '0x66703c058795B9Cb215fbcc7c6b07aee7D216F24',
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
    // These connectors are based on how `connectkit` configures them internally when using
    // their default configuration.
    // https://github.com/family/connectkit/blob/47984040867a15ff8cbfdcdea534ad662c2d405e/packages/connectkit/src/defaultConfig.ts#L173
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
          appLogoUrl: 'https://geobrowser.io/static/favicon-64x64.png',
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
            icons: ['https://geobrowser.io/static/favicon-64x64.png'],
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

export function WalletProvider({
  children,
  onConnectionChange,
}: {
  children: React.ReactNode;
  onConnectionChange: (type: 'connect' | 'disconnect', address: string) => Promise<void>;
}) {
  const onConnect = React.useCallback(
    ({ address }: { address?: string }) => {
      if (!address) {
        return;
      }

      onConnectionChange('connect', address);
    },
    [onConnectionChange]
  );

  const onDisconnect = React.useCallback(() => {
    onConnectionChange('disconnect', '');
  }, [onConnectionChange]);

  return (
    // @ts-expect-error not sure why wagmi isn't happy. It works at runtime as expected.
    <WagmiConfig config={wagmiConfig}>
      <ConnectKitProvider onConnect={onConnect} onDisconnect={onDisconnect}>
        {children}
      </ConnectKitProvider>
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

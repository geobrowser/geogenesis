'use client';

import { ConnectKitButton, ConnectKitProvider, getDefaultConfig } from 'connectkit';
import { useSetAtom } from 'jotai';
import { createPublicClient, createWalletClient, http } from 'viem';

import * as React from 'react';

import { Chain, WagmiConfig, configureChains, createConfig, useConnect, useDisconnect } from 'wagmi';
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

import {
  accountTypeAtom,
  avatarAtom,
  nameAtom,
  profileIdAtom,
  spaceAddressAtom,
  stepAtom,
} from '~/partials/onboarding/dialog';

import { Cookie } from '../cookie';
import { Environment } from '../environment';
import { VarsLive } from '../environment/environment';
import { CONDUIT_TESTNET } from './conduit-chain';

// const LOCAL_CHAIN: Chain = {
//   id: Number(Environment.options.development.chainId),
//   name: 'Geo Genesis Dev', // Human-readable name
//   network: 'ethereum', // Internal network name
//   nativeCurrency: {
//     name: 'Ethereum',
//     symbol: 'ETH',
//     decimals: 18,
//   },
//   rpcUrls: {
//     default: {
//       http: [Environment.options.development.rpc],
//     },
//     public: {
//       http: [Environment.options.development.rpc],
//     },
//   },
// };

const { chains, publicClient, webSocketPublicClient } = configureChains(
  [CONDUIT_TESTNET],
  [
    jsonRpcProvider({
      rpc: (_: Chain): { http: string; webSocket?: string } => {
        return {
          http: CONDUIT_TESTNET.rpcUrls.default.http[0],
        };
      },
    }),
    // We need to use another provider if using a local chain
    ...(VarsLive.appEnv === 'development' ? [publicProvider()] : []),
  ]
);

const getMockWalletClient = () =>
  createWalletClient({
    transport: http(CONDUIT_TESTNET.rpcUrls.default.http[0]),
    chain: CONDUIT_TESTNET,
    account: '0x66703c058795B9Cb215fbcc7c6b07aee7D216F24',
    key: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    pollingInterval: 100,
  });

const getMockPublicClient = () => {
  return createPublicClient({
    transport: http(CONDUIT_TESTNET.rpcUrls.default.http[0]),
    chain: CONDUIT_TESTNET,
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
          projectId: VarsLive.walletConnectProjectId,
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
  options: { chainId: CONDUIT_TESTNET.id, walletClient: getMockWalletClient() },
});

const createMockWalletConfig = () => {
  return createConfig(
    getDefaultConfig({
      connectors: [mockConnector],
      appName: 'Geo Genesis',
      chains,
      publicClient: getMockPublicClient(),
      autoConnect: false,
      walletConnectProjectId: VarsLive.walletConnectProjectId,
    })
  );
};

const wagmiConfig = VarsLive.isTestEnv ? createMockWalletConfig() : createRealWalletConfig();

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const onConnect = React.useCallback(({ address }: { address?: string }) => {
    if (!address) {
      return;
    }

    Cookie.onConnectionChange('connect', address);
  }, []);

  const onDisconnect = React.useCallback(() => {
    Cookie.onConnectionChange('disconnect', '');
  }, []);

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

  const setAccountType = useSetAtom(accountTypeAtom);
  const setName = useSetAtom(nameAtom);
  const setAvatar = useSetAtom(avatarAtom);
  const setSpaceAddress = useSetAtom(spaceAddressAtom);
  const setProfileId = useSetAtom(profileIdAtom);
  const setStep = useSetAtom(stepAtom);

  const resetOnboarding = () => {
    setAccountType(null);
    setName('');
    setAvatar('');
    setSpaceAddress('');
    setProfileId('');
    setStep('start');
  };

  return (
    <ConnectKitButton.Custom>
      {({ show, isConnected }) => {
        if (!isConnected) {
          return (
            <Button
              onClick={
                VarsLive.isTestEnv
                  ? () => {
                      console.log('Test environment detected: using mock wallet');
                      connect({
                        connector: mockConnector,
                        chainId: CONDUIT_TESTNET.id,
                      });
                    }
                  : () => {
                      resetOnboarding();
                      show?.();
                    }
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
            onClick={() => {
              resetOnboarding();
              disconnect();
            }}
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

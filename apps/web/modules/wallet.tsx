import * as React from 'react';
import { ConnectKitButton, ConnectKitProvider, getDefaultClient } from 'connectkit';
import { Chain, configureChains, createClient, useDisconnect, WagmiConfig } from 'wagmi';
import { polygon, polygonMumbai } from 'wagmi/chains';
import { publicProvider } from 'wagmi/providers/public';

import { Config } from './config';
import { Link } from './design-system/icons/link';
import { Unlink } from './design-system/icons/unlink';
import { Spacer } from './design-system/spacer';
import { Text } from './design-system/text';

// const LOCAL_CHAIN: Chain = {
//   id: Number(Config.options.development.chainId),
//   name: 'Geo Genesis Dev', // Human-readable name
//   network: 'ethereum', // Internal network name
//   nativeCurrency: {
//     name: 'Ethereum',
//     symbol: 'ETH',
//     decimals: 18,
//   },
//   rpcUrls: {
//     default: {
//       http: [Config.options.development.rpc]
//     }
//   },
// };

const TESTNET_CHAIN: Chain = {
  ...polygonMumbai,
  rpcUrls: {
    default: {
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
  },
};

const { chains, provider, webSocketProvider } = configureChains([DEFAULT_CHAIN, TESTNET_CHAIN], [publicProvider()]);

const wagmiClient = createClient({
  ...getDefaultClient({
    appName: 'Geo Genesis',
    chains,
    webSocketProvider,
    provider,
    autoConnect: true,
  }),
});

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
        return (
          // We're using an anonymous function for disconnect to appease the TS gods.
          <button
            onClick={isConnected ? () => disconnect() : show}
            className="m-0 flex w-full cursor-pointer items-center border-none bg-transparent p-0 text-ctaPrimary"
          >
            {isConnected ? <Unlink /> : <Link />}
            <Spacer width={8} />
            <Text color="ctaPrimary" variant="button">
              {isConnected ? 'Disconnect wallet' : 'Connect wallet'}
            </Text>
          </button>
        );
      }}
    </ConnectKitButton.Custom>
  );
}

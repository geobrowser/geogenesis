import styled from '@emotion/styled';
import { ConnectButton, getDefaultWallets, RainbowKitProvider } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import { Chain, configureChains, createClient, WagmiConfig } from 'wagmi';
import { publicProvider } from 'wagmi/providers/public';
import { configOptions } from './config';
import { TextButton } from '~/modules/design-system/text-button';

// const LOCAL_CHAIN: Chain = {
//   id: Number(configOptions.development.chainId),
//   name: 'Geo Genesis Dev', // Human-readable name
//   network: 'ethereum', // Internal network name
//   nativeCurrency: {
//     name: 'Ethereum',
//     symbol: 'ETH',
//     decimals: 18,
//   },
//   rpcUrls: {
//     default: {
//       http: [configOptions.development.rpc],
//     },
//   },
// };

// const STAGING_CHAIN: Chain = {
//   id: Number(configOptions.staging.chainId),
//   name: 'Geo Genesis Staging', // Human-readable name
//   network: 'ethereum', // Internal network name
//   nativeCurrency: {
//     name: 'Ethereum',
//     symbol: 'ETH',
//     decimals: 18,
//   },
//   rpcUrls: {
//     default: configOptions.staging.rpc,
//   },
// };

const TESTNET_CHAIN: Chain = {
  id: Number(configOptions.testnet.chainId),
  name: 'Polygon Mumbai', // Human-readable name
  network: 'mumbai', // Internal network name
  nativeCurrency: {
    name: 'Polygon Mumbai',
    symbol: 'MATIC',
    decimals: 18,
  },
  rpcUrls: {
    default: configOptions.testnet.rpc,
  },
};

const DEFAULT_CHAIN: Chain = {
  id: Number(configOptions.production.chainId),
  name: 'Polygon', // Human-readable name
  network: 'polygon', // Internal network name
  nativeCurrency: {
    name: 'Polygon Mumbai',
    symbol: 'MATIC',
    decimals: 18,
  },
  rpcUrls: {
    default: configOptions.production.rpc,
  },
};

const { chains, provider, webSocketProvider } = configureChains([DEFAULT_CHAIN, TESTNET_CHAIN], [publicProvider()]);

const { connectors } = getDefaultWallets({
  appName: 'Geo Genesis',
  chains,
});

export const wagmiClient = createClient({
  autoConnect: true,
  connectors,
  provider,
  webSocketProvider,
});

export function WalletProvider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiConfig client={wagmiClient}>
      <RainbowKitProvider chains={chains}>{children}</RainbowKitProvider>
    </WagmiConfig>
  );
}

export function GeoConnectButton() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, authenticationStatus, mounted }) => {
        return <StyledConnectButton>Connect</StyledConnectButton>;
      }}
    </ConnectButton.Custom>
  );
}

const StyledConnectButton = styled(TextButton)(props => ({
  ...props.theme.typography.button,
  color: props.theme.colors.ctaPrimary,
}));

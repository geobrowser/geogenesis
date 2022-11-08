import { getDefaultWallets, RainbowKitProvider } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import { Chain, configureChains, createClient, WagmiConfig } from 'wagmi';
import { publicProvider } from 'wagmi/providers/public';
import { configOptions } from './config';

const LOCAL_CHAIN: Chain = {
  id: Number(configOptions.development.chainId),
  name: 'Geo Genesis Dev', // Human-readable name
  network: 'ethereum', // Internal network name
  rpcUrls: {
    default: configOptions.development.rpc,
  },
};

const STAGING_CHAIN: Chain = {
  id: Number(configOptions.staging.chainId),
  name: 'Geo Genesis Staging', // Human-readable name
  network: 'ethereum', // Internal network name
  rpcUrls: {
    default: configOptions.staging.rpc,
  },
};

const TESTNET_CHAIN: Chain = {
  id: Number(configOptions.testnet.chainId),
  name: 'Polygon Mumbai', // Human-readable name
  network: 'mumbai', // Internal network name
  rpcUrls: {
    default: configOptions.testnet.rpc,
  },
};

const DEFAULT_CHAIN: Chain = {
  id: Number(configOptions.production.chainId),
  name: 'Geo Genesis', // Human-readable name
  network: 'ethereum', // Internal network name
  rpcUrls: {
    default: configOptions.production.rpc,
  },
};

const { chains, provider, webSocketProvider } = configureChains(
  [DEFAULT_CHAIN, TESTNET_CHAIN, STAGING_CHAIN, LOCAL_CHAIN],
  [publicProvider()]
);

const { connectors } = getDefaultWallets({
  appName: 'Geo Genesis',
  chains,
});

const wagmiClient = createClient({
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

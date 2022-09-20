import { getDefaultWallets, RainbowKitProvider } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import { Chain, chain, configureChains, createClient, WagmiConfig } from 'wagmi';
import { publicProvider } from 'wagmi/providers/public';

const LOCAL_CHAIN: Chain = {
  /** ID in number form */
  id: 31337,
  /** Human-readable name */
  name: 'localhost',
  /** Internal network name */
  network: 'ethereum',
  /** Collection of RPC endpoints */
  rpcUrls: {
    default: 'http://localhost:8545',
    // public: 'http://localhost:8545',
    // alchemy: 'http://localhost:8545',
    // infura: 'http://localhost:8545',
  },
};

const { chains, provider, webSocketProvider } = configureChains(
  [LOCAL_CHAIN, chain.polygonMumbai, chain.polygon],
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

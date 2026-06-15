import { createConfig } from '@privy-io/wagmi';
import type { Chain } from 'viem';
import { http } from 'viem';
import { createConfig as createWagmiConfig, type Config } from 'wagmi';
import { coinbaseWallet, injected, mock, walletConnect } from 'wagmi/connectors';

type PrivyWagmiConfig = ReturnType<typeof createConfig>;
type PrivyCreateConfigParams = Parameters<typeof createConfig>[0];

export type GeoWalletConfigParams = {
  chain: Chain;
  rpcUrl: string;
  walletConnectProjectId: string;
};

export const createGeoWalletConfig = ({ chain, rpcUrl: rpc, walletConnectProjectId }: GeoWalletConfigParams): Config =>
  createConfig({
    chains: [chain],
    // This enables us to use a single injected connector but handle multiple wallet
    // extensions within the browser.
    multiInjectedProviderDiscovery: true,
    transports: {
      [chain.id]: http(rpc),
    },
    ssr: true,
    connectors: [
      coinbaseWallet({
        appName: 'Geo Genesis',
        appLogoUrl: 'https://geobrowser.io/static/favicon-64x64.png',
      }),
      walletConnect({
        showQrModal: true,
        projectId: walletConnectProjectId,
        metadata: {
          name: 'Geo Genesis',
          description: "Browse and organize the world's public knowledge and information in a decentralized way.",
          url: 'https://geobrowser.io',
          icons: ['https://geobrowser.io/static/favicon-64x64.png'],
        },
      }),
      injected({
        target() {
          return {
            id: 'windowProvider',
            name: 'Window Provider',
            provider: w => w?.ethereum,
          };
        },
        shimDisconnect: true,
      }),
    ],
  } as any) as Config;

export const createMockConfig = (chain: Chain): Config =>
  createConfig({
    chains: [chain],
    transports: {
      [chain.id]: http(),
    },
    connectors: [
      mock({
        accounts: ['0x66703c058795B9Cb215fbcc7c6b07aee7D216F24'],
      }),
    ],
  } as any) as Config;

// Local-dev wagmi config: real injected (MetaMask) connector against a local chain.
// Used when NEXT_PUBLIC_IS_LOCAL_DEV=true so users sign with their browser-extension EOA
// instead of a Privy embedded wallet routed through the Pimlico bundler.
//
// Uses standard wagmi's createConfig (not @privy-io/wagmi's), because in local-dev mode the
// Privy provider is NOT mounted — Privy's WagmiProvider/useSetActiveWallet would call useWallets
// internally and crash without the Privy context above it. Pair with wagmi's standard
// WagmiProvider in apps/web/core/wallet/wallet.tsx.
export const createLocalDevConfig = ({ chain, rpcUrl }: { chain: Chain; rpcUrl: string }): Config =>
  createWagmiConfig({
    chains: [chain],
    multiInjectedProviderDiscovery: true,
    transports: {
      [chain.id]: http(rpcUrl),
    },
    ssr: true,
    connectors: [
      injected({
        target() {
          return {
            id: 'windowProvider',
            name: 'Browser Wallet',
            provider: w => w?.ethereum,
          };
        },
        shimDisconnect: true,
      }),
    ],
  });

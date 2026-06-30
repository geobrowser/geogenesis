import type { Chain } from 'viem';

const MAINNET_DEFAULT_RPC_URL = 'https://rpc-geo-genesis-h0q2s21xx8.t.conduit.xyz';
const TESTNET_DEFAULT_RPC_URL = 'https://rpc-geo-testnet-irdc0cgb0w.t.conduit.xyz';
const LOCAL_DEFAULT_RPC_URL = 'http://localhost:8545';

const CHAIN_IDS = {
  MAINNET: 80451,
  TESTNET: 55516,
  LOCAL: 1337,
} as const;

const DEFAULT_RPC_URLS = {
  MAINNET: MAINNET_DEFAULT_RPC_URL,
  TESTNET: TESTNET_DEFAULT_RPC_URL,
  LOCAL: LOCAL_DEFAULT_RPC_URL,
} as const;

const NATIVE_CURRENCIES = {
  MAINNET: { name: 'Geo', symbol: 'GEO', decimals: 18 },
  TESTNET: { name: 'Geo', symbol: 'GEO', decimals: 18 },
  LOCAL: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
} as const;

export type GeoNetwork = 'TESTNET' | 'MAINNET' | 'LOCAL';

export const getGeoChain = (network: GeoNetwork, rpcUrl?: string) => {
  const http = rpcUrl ?? DEFAULT_RPC_URLS[network];
  const chain: Chain = {
    id: CHAIN_IDS[network],
    name: network === 'LOCAL' ? 'Geo Local' : 'Geo Genesis',
    nativeCurrency: { ...NATIVE_CURRENCIES[network] },
    rpcUrls: {
      default: { http: [http] },
      public: { http: [http] },
    },
  };
  return chain;
};

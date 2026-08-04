import { GeoTestnetConfig } from '@geoprotocol/geo-sdk';
import type { Chain } from 'viem';

// The SDK has no mainnet network config yet, so the mainnet chain id/RPC live
// here until it ships one. Testnet identity comes from the SDK.
const MAINNET_DEFAULT_RPC_URL = 'https://rpc-geo-genesis-h0q2s21xx8.t.conduit.xyz';

const CHAIN_IDS = {
  MAINNET: 80451,
  TESTNET: GeoTestnetConfig.chain?.id ?? 55516,
} as const;

const DEFAULT_RPC_URLS = {
  MAINNET: MAINNET_DEFAULT_RPC_URL,
  TESTNET: GeoTestnetConfig.chain?.rpcUrl,
} as const;

const NATIVE_CURRENCY = { name: 'Geo', symbol: 'GEO', decimals: 18 } as const;

export type GeoNetwork = 'TESTNET' | 'MAINNET';

export const getGeoChain = (network: GeoNetwork, rpcUrl?: string) => {
  const http = rpcUrl ?? DEFAULT_RPC_URLS[network];
  if (!http) {
    throw new Error(`No RPC URL available for Geo ${network} — pass rpcUrl explicitly.`);
  }
  const chain: Chain = {
    id: CHAIN_IDS[network],
    name: 'Geo Genesis',
    nativeCurrency: { ...NATIVE_CURRENCY },
    rpcUrls: {
      default: { http: [http] },
      public: { http: [http] },
    },
  };
  return chain;
};

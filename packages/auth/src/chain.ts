import type { Chain } from 'viem'

const MAINNET_DEFAULT_RPC_URL =
  'https://rpc-geo-genesis-h0q2s21xx8.t.conduit.xyz'
const TESTNET_DEFAULT_RPC_URL = 'https://rpc-geo-test-zc16z3tcvf.t.conduit.xyz'

export const createChain = (network: 'TESTNET' | 'MAINNET', rpcUrl: string) => {
  const chain: Chain = {
    id: network === 'TESTNET' ? Number('19411') : Number('80451'),
    name: 'Geo Genesis',
    nativeCurrency: {
      name: 'Ethereum',
      symbol: 'ETH',
      decimals: 18,
    },
    rpcUrls: {
      default: {
        http: [
          rpcUrl ??
            (network === 'TESTNET'
              ? TESTNET_DEFAULT_RPC_URL
              : MAINNET_DEFAULT_RPC_URL),
        ],
      },
      public: {
        http: [
          rpcUrl ??
            (network === 'TESTNET'
              ? TESTNET_DEFAULT_RPC_URL
              : MAINNET_DEFAULT_RPC_URL),
        ],
      },
    },
  }
  return chain
}

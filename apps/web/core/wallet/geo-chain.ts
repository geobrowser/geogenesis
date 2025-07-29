import { Chain } from 'viem';

import { Environment } from '../environment';

const chainId = Environment.getConfig().chainId;

export const GEOGENESIS: Chain = {
  id: Number(chainId),
  name: 'Geo Genesis',
  nativeCurrency: {
    name: chainId === '80451' ? 'The Graph' : 'Ethereum',
    symbol: chainId === '80451' ? 'GRT' : 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [Environment.getConfig().rpc],
    },
    public: {
      http: [Environment.getConfig().rpc],
    },
  },
};

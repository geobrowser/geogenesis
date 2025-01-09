import { Chain } from 'viem';

import { Environment } from '../environment';

export const GEOGENESIS: Chain = {
  id: Number(Environment.options.production.chainId),
  name: 'Geo Genesis',
  nativeCurrency: {
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [Environment.options.production.rpc],
    },
    public: {
      http: [Environment.options.production.rpc],
    },
  },
};

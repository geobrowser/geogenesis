import { Chain } from 'viem';

import { Environment } from '../environment';

export const CONDUIT_TESTNET: Chain = {
  id: Number(Environment.options.production.chainId),
  name: 'Geo Genesis Conduit Dev',
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

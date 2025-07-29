import { Chain } from 'viem';

import { Environment } from '../environment';

const chainId = Environment.getConfig().chainId;

export const GEOGENESIS: Chain = {
  id: Number(chainId),
  name: 'Geo Genesis',
  nativeCurrency: {
    name: chainId === '80451' ? 'Ethereum' : 'The Graph',
    symbol: chainId === '80451' ? 'ETH' : 'GRT',
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

import { Chain } from 'viem';

import { Environment } from '../environment';

const config = Environment.getConfig();
const id = config.chainId;
const rpc = config.rpc;

export const GEOGENESIS: Chain = {
  id: Number(id),
  name: 'Geo Genesis',
  nativeCurrency: {
    name: id === '80451' ? 'The Graph' : 'Ethereum',
    symbol: id === '80451' ? 'GRT' : 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [rpc],
    },
    public: {
      http: [rpc],
    },
  },
};

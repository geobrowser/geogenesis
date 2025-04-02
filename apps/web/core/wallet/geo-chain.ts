import { Chain } from 'viem';

import { Environment } from '../environment';

const id = Environment.options[Environment.variables.appEnv].chainId;
const rpc = Environment.options[Environment.variables.appEnv].rpc;

export const GEOGENESIS: Chain = {
  id: Number(id),
  name: 'Geo Genesis',
  nativeCurrency: {
    name: 'Ethereum',
    symbol: 'ETH',
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

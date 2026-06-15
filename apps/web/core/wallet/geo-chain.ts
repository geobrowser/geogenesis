import { getGeoChain } from '@geogenesis/auth/server';

import { Environment } from '../environment';

const config = Environment.getConfig();

const networkForChain = (id: string): 'TESTNET' | 'MAINNET' | 'LOCAL' => {
  if (Environment.variables.isLocalDev) return 'LOCAL';
  if (id === '19411') return 'TESTNET';
  return 'MAINNET';
};

export const GEOGENESIS = getGeoChain(networkForChain(config.chainId), config.rpc);

import { getGeoChain } from '@geogenesis/auth/server';

import { Environment } from '../environment';

const config = Environment.getConfig();

export const GEOGENESIS = getGeoChain(config.chainId === '55516' ? 'TESTNET' : 'MAINNET', config.rpc);

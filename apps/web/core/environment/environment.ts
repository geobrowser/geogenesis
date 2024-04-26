import { IPFS_GATEWAY_PATH } from '../constants';
import { AppEnv } from '../types';

type SupportedChainId = '31337' | '19411';

export type AppConfig = {
  chainId: SupportedChainId;
  rpc: string;
  ipfs: string;
  api: string;
};

export const DEFAULT_ENV: AppEnv = 'production';

export const options: Record<AppEnv, AppConfig> = {
  development: {
    chainId: '31337',
    rpc: 'http://localhost:8545',
    ipfs: IPFS_GATEWAY_PATH,
    api: 'http://localhost:5001/graphql',
  },
  production: {
    chainId: '19411',
    rpc: process.env.NEXT_PUBLIC_CONDUIT_TESTNET_RPC!,
    ipfs: IPFS_GATEWAY_PATH,
    api: 'https://geo-conduit.up.railway.app/graphql',
    // api: 'http://localhost:5001/graphql',
  },
  testnet: {
    chainId: '19411',
    rpc: process.env.NEXT_PUBLIC_CONDUIT_TESTNET_RPC!,
    ipfs: IPFS_GATEWAY_PATH,
    api: 'https://geo-conduit.up.railway.app/graphql',
  },
};

export const getConfig = (env?: string): AppConfig => {
  if (!env) {
    console.log(`No env passed in. Defaulting to ${DEFAULT_ENV}`);
    return options['production'];
  }

  if (!(env in options)) {
    console.error(`No config for env ${env}`);
    return options['production'];
  }

  return options[env as AppEnv];
};

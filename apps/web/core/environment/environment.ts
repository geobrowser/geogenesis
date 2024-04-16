import { AppEnv } from '../types';

type SupportedChainId = '137' | '1337' | '80001' | '31337';

export type AppConfig = {
  chainId: SupportedChainId;
  rpc: string;
  ipfs: string;
  membershipSubgraph: string;
  profileSubgraph: string;
  api: string;
};

export const DEFAULT_ENV: AppEnv = 'production';

export const options: Record<AppEnv, AppConfig> = {
  development: {
    chainId: '31337',
    rpc: 'http://localhost:8545',
    ipfs: 'https://api.thegraph.com/ipfs',
    membershipSubgraph: '',
    profileSubgraph: '',
    api: 'http://localhost:5001/graphql',
  },
  testnet: {
    chainId: '80001',
    rpc: 'https://rpc-mumbai.maticvigil.com',
    ipfs: 'https://api.thegraph.com/ipfs',
    membershipSubgraph: 'https://api.thegraph.com/subgraphs/name/baiirun/geo-membership-mumbai',
    profileSubgraph: 'https://api.thegraph.com/subgraphs/name/baiirun/geo-profile-registry-mumbai',
    api: 'http://localhost:5001/graphql',
  },
  production: {
    chainId: '137',
    rpc: 'https://polygon-rpc.com',
    ipfs: 'https://api.thegraph.com/ipfs',
    membershipSubgraph: 'https://api.thegraph.com/subgraphs/name/baiirun/geo-membership-logs',
    profileSubgraph: 'https://api.thegraph.com/subgraphs/name/baiirun/geo-profile-registry',
    api: 'https://geobrowser.up.railway.app/graphql',
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

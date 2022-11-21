export type AppEnv = 'development' | 'staging' | 'testnet' | 'production';

export type SupportedChainId = '137' | '1337' | '80001' | '31337';

export type AppConfig = {
  chainId: SupportedChainId;
  rpc: string;
  ipfs: string;
  subgraph: string;
};

export const DEFAULT_ENV: AppEnv = 'testnet';

export const configOptions: Record<AppEnv, AppConfig> = {
  development: {
    chainId: '31337',
    rpc: 'http://localhost:8545',
    ipfs: 'https://api.staging.thegraph.com/ipfs',
    subgraph: 'http://localhost:8000/subgraphs/name/example',
  },
  staging: {
    chainId: '1337',
    rpc: 'https://devnet-dabbott.cloud.okteto.net',
    ipfs: 'https://api.staging.thegraph.com/ipfs',
    subgraph: 'https://graph-node-8000-dabbott.cloud.okteto.net/subgraphs/name/example',
  },
  testnet: {
    chainId: '80001',
    rpc: 'https://rpc-mumbai.maticvigil.com',
    ipfs: 'https://api.thegraph.com/ipfs',
    subgraph: 'https://api.thegraph.com/subgraphs/name/baiirun/banana',
  },
  production: {
    chainId: '137',
    rpc: 'https://polygon-rpc.com',
    ipfs: 'https://api.thegraph.com/ipfs',
    subgraph: 'https://api.thegraph.com/subgraphs/name/baiirun/geo',
  },
};

export function getConfig(chainId: string) {
  const config = Object.values(configOptions).find(options => options.chainId === chainId);

  if (!config) {
    throw new Error(`No config for chain ${chainId}`);
  }

  return config;
}

export const appEnv = (process.env as Record<string, string>).NEXT_PUBLIC_APP_ENV as AppEnv;

type AppEnv = 'development' | 'staging' | 'production';

export type SupportedChainId = '137' | '1337' | '31337';

type AppConfig = {
  chainId: SupportedChainId;
  rpc: string;
  ipfs: string;
  subgraph: string;
};

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
  production: {
    chainId: '1337',
    rpc: 'https://devnet-dabbott.cloud.okteto.net',
    ipfs: 'https://api.staging.thegraph.com/ipfs',
    // ipfs: 'https://api.thegraph.com/ipfs',
    subgraph: 'https://graph-node-8000-dabbott.cloud.okteto.net/subgraphs/name/example',
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

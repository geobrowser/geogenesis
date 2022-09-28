type AppEnv = 'development' | 'staging' | 'production';

export type SupportedChainId = '137' | '1337' | '31337';

type AppConfig = {
  chainId: SupportedChainId;
  rpc: string;
  ipfs: string;
  subgraph: string;
  devServer: string;
};

export const configOptions: Record<AppEnv, AppConfig> = {
  development: {
    chainId: '31337',
    rpc: 'http://localhost:8545',
    ipfs: 'http://localhost:5001',
    subgraph: 'http://localhost:8000/subgraphs/name/example',
    devServer: 'http://localhost:3111',
  },
  staging: {
    chainId: '1337',
    rpc: 'https://devnet-dabbott.cloud.okteto.net',
    ipfs: 'https://ipfs-dabbott.cloud.okteto.net',
    subgraph: 'https://graph-node-8000-dabbott.cloud.okteto.net/subgraphs/name/example',
    devServer: 'https://dev-server-dabbott.cloud.okteto.net',
  },
  production: {
    chainId: '137',
    rpc: '',
    ipfs: 'https://api.thegraph.com/ipfs',
    subgraph: '',
    devServer: '',
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

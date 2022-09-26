type AppEnv = 'development' | 'staging' | 'production';

type AppConfig = {
  chainId: string;
  rpc: string;
  ipfs: string;
  subgraph: string;
  devServer: string;
};

const configOptions: Record<AppEnv, AppConfig> = {
  development: {
    chainId: '31337',
    rpc: 'http://localhost:8545',
    ipfs: 'http://localhost:5001',
    subgraph: 'http://localhost:8000/subgraphs/name/example',
    devServer: 'http://localhost:3111',
  },
  staging: {
    chainId: '31337',
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

export const appEnv = (process.env as Record<string, string>).NEXT_PUBLIC_APP_ENV as AppEnv;

export const config = configOptions[appEnv];

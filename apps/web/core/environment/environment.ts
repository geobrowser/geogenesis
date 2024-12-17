import { IPFS_GATEWAY_PATH } from '../constants';
import { AppEnv } from '../types';

type SupportedChainId = '31337' | '80451';

export type AppConfig = {
  chainId: SupportedChainId;
  rpc: string;
  ipfs: string;
  api: string;
  bundler: string;
};

type IVars = Readonly<{
  liveBlocksPublicKey: string;
  appEnv: string;
  walletConnectProjectId: string;
  privyAppId: string;
  rpcEndpoint: string;
  geoPk: string;
  accountAbstractionApiKey: string;
  isTestEnv: boolean;
}>;

export const variables: IVars = {
  appEnv: process.env.NEXT_PUBLIC_APP_ENV!,
  isTestEnv: process.env.NEXT_PUBLIC_IS_TEST_ENV === 'true',
  liveBlocksPublicKey: process.env.NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY!,
  geoPk: process.env.GEO_PK!,
  privyAppId: process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
  rpcEndpoint: process.env.NEXT_PUBLIC_GEOGENESIS_RPC!,
  walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
  accountAbstractionApiKey: process.env.NEXT_PUBLIC_PIMLICO_API_KEY!,
};

// @TODO: This eventually completely comes from our environment instead of hardcoded here.
// We can ensure our env matches the right schema in `make` above.
export const options: Record<AppEnv, AppConfig> = {
  development: {
    chainId: '31337',
    rpc: 'http://localhost:8545',
    ipfs: IPFS_GATEWAY_PATH,
    api: 'http://localhost:5001/graphql',
    bundler: `https://api.pimlico.io/v2/geo-testnet/rpc?apikey=${variables.accountAbstractionApiKey}`,
  },
  production: {
    chainId: '80451',
    rpc: variables.rpcEndpoint,
    ipfs: IPFS_GATEWAY_PATH,
    api: 'http://localhost:5001/graphql',
    bundler: `https://api.pimlico.io/v2/geo-testnet/rpc?apikey=${variables.accountAbstractionApiKey}`,
  },
  testnet: {
    chainId: '80451',
    rpc: variables.rpcEndpoint,
    ipfs: IPFS_GATEWAY_PATH,
    api: 'https://geo-conduit.up.railway.app/graphql',
    bundler: `https://api.pimlico.io/v2/geo-testnet/rpc?apikey=${variables.accountAbstractionApiKey}`,
  },
};

export const getConfig = (): AppConfig => {
  const env = variables.appEnv;

  if (!(env in options)) {
    console.error(`No config for env ${env}`);
    return options['production'];
  }

  return options[env as AppEnv];
};

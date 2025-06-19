import { IPFS_GATEWAY_PATH } from '../constants';
import { AppEnv } from '../types';
import {
  ACCOUNT_ABSTRACTION_API_KEY,
  APP_ENV,
  ONBOARD_CODE,
  ONBOARD_FLAG,
  PRIVY_APP_ID,
  RPC_ENDPOINT,
  TEST_ENV,
  WALLETCONNECT_PROJECT_ID,
} from './config';

type SupportedChainId = '31337' | '80451';

type AppConfig = {
  chainId: SupportedChainId;
  rpc: string;
  ipfs: string;
  api: string;
  bundler: string;
};

type IVars = Readonly<{
  appEnv: string;
  walletConnectProjectId: string;
  privyAppId: string;
  rpcEndpoint: string;
  accountAbstractionApiKey: string;
  isTestEnv: boolean;
  onboardFlag: string;
  onboardCode: string;
}>;

export const variables: IVars = {
  appEnv: APP_ENV!,
  isTestEnv: TEST_ENV === 'true',
  privyAppId: PRIVY_APP_ID!,
  rpcEndpoint: RPC_ENDPOINT!,
  walletConnectProjectId: WALLETCONNECT_PROJECT_ID!,
  accountAbstractionApiKey: ACCOUNT_ABSTRACTION_API_KEY!,
  onboardFlag: ONBOARD_FLAG!,
  onboardCode: ONBOARD_CODE!,
};

// @TODO: This eventually completely comes from our environment instead of hardcoded here.
// We can ensure our env matches the right schema in `make` above.
export const options: Record<AppEnv, AppConfig> = {
  development: {
    chainId: '31337',
    rpc: 'http://localhost:8545',
    ipfs: IPFS_GATEWAY_PATH,
    api: 'http://localhost:5001/graphql',
    bundler: `https://api.pimlico.io/v2/80451/rpc?apikey=${variables.accountAbstractionApiKey}`,
  },
  production: {
    chainId: '80451',
    rpc: variables.rpcEndpoint,
    ipfs: IPFS_GATEWAY_PATH,
    api: 'https://hypergraph-v2-testnet.up.railway.app/graphql',
    bundler: `https://api.pimlico.io/v2/80451/rpc?apikey=${variables.accountAbstractionApiKey}`,
  },
  testnet: {
    chainId: '80451',
    rpc: variables.rpcEndpoint,
    ipfs: IPFS_GATEWAY_PATH,
    api: 'https://geo-conduit.up.railway.app/graphql',
    bundler: `https://api.pimlico.io/v2/80451/rpc?apikey=${variables.accountAbstractionApiKey}`,
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

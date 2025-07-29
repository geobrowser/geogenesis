import { IPFS_GATEWAY_PATH } from '../constants';
import {
  ACCOUNT_ABSTRACTION_API_KEY,
  API_ENDPOINT,
  API_ENDPOINT_TESTNET,
  BUNDLER_RPC_ENDPOINT,
  BUNDLER_RPC_ENDPOINT_TESTNET,
  ONBOARD_CODE,
  ONBOARD_FLAG,
  PRIVY_APP_ID,
  RPC_ENDPOINT,
  RPC_ENDPOINT_TESTNET,
  TEST_ENV,
  WALLETCONNECT_PROJECT_ID,
} from './config';

type SupportedChainId = '31337' | '80451' | '19411';

export type AppConfig = {
  chainId: SupportedChainId;
  rpc: string;
  ipfs: string;
  api: string;
  bundler: string;
};

type IVars = Readonly<{
  chainId: '19411' | '80451';
  walletConnectProjectId: string;
  privyAppId: string;
  rpcEndpoint: string;
  apiEndpoint: string;
  bundlerRpcEndpoint: string;
  rpcEndpointTestnet: string;
  apiEndpointTestnet: string;
  bundlerRpcEndpointTestnet: string;
  accountAbstractionApiKey: string;
  isTestEnv: boolean;
  onboardFlag: string;
  onboardCode: string;
}>;

export const variables: IVars = {
  chainId: '19411',
  isTestEnv: TEST_ENV === 'true',
  privyAppId: PRIVY_APP_ID!,
  rpcEndpoint: RPC_ENDPOINT!,
  apiEndpoint: API_ENDPOINT!,
  bundlerRpcEndpoint: BUNDLER_RPC_ENDPOINT!,
  rpcEndpointTestnet: RPC_ENDPOINT_TESTNET!,
  apiEndpointTestnet: API_ENDPOINT_TESTNET!,
  bundlerRpcEndpointTestnet: BUNDLER_RPC_ENDPOINT_TESTNET!,
  walletConnectProjectId: WALLETCONNECT_PROJECT_ID!,
  accountAbstractionApiKey: ACCOUNT_ABSTRACTION_API_KEY!,
  onboardFlag: ONBOARD_FLAG!,
  onboardCode: ONBOARD_CODE!,
};

export const getConfig = (): AppConfig => {
  const chainId = '19411';
  const rpc = chainId === '19411' ? variables.rpcEndpointTestnet : variables.rpcEndpoint;
  const api = chainId === '19411' ? variables.apiEndpointTestnet : variables.apiEndpoint;
  const bundler = chainId === '19411' ? variables.bundlerRpcEndpointTestnet : variables.bundlerRpcEndpoint;

  return {
    chainId,
    rpc,
    ipfs: IPFS_GATEWAY_PATH,
    api,
    bundler: `${bundler}?apikey=${variables.accountAbstractionApiKey}`,
  };
};

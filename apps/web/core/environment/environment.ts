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
  SENTRY_DSN,
  TEST_ENV,
  WALLETCONNECT_PROJECT_ID,
} from './config';

type SupportedChainId = '31337' | '80451' | '19411';

export type AppConfig = {
  chainId: SupportedChainId;
  rpc: string;
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
  sentryDsn?: string;
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
  sentryDsn: SENTRY_DSN,
};

export const getConfig = (): AppConfig => {
  const rpc = variables.chainId === '19411' ? variables.rpcEndpointTestnet : variables.rpcEndpoint;
  const api = variables.chainId === '19411' ? variables.apiEndpointTestnet : variables.apiEndpoint;
  const bundler = variables.chainId === '19411' ? variables.bundlerRpcEndpointTestnet : variables.bundlerRpcEndpoint;

  return {
    chainId: variables.chainId,
    rpc,
    api,
    bundler: `${bundler}?apikey=${variables.accountAbstractionApiKey}`,
  };
};

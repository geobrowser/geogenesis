import {
  ACCOUNT_ABSTRACTION_API_KEY,
  API_ENDPOINT,
  API_ENDPOINT_TESTNET,
  BUNDLER_RPC_ENDPOINT,
  PRIVY_APP_ID,
  RPC_ENDPOINT,
  RPC_ENDPOINT_TESTNET,
  SENTRY_DSN,
  TEST_ENV,
  WALLETCONNECT_PROJECT_ID,
  ZERODEV_RPC_URL_TESTNET,
} from './config';

type SupportedChainId = '31337' | '80451' | '55516';

export type AppConfig = {
  chainId: SupportedChainId;
  rpc: string;
  api: string;
  bundler: string;
};

type IVars = Readonly<{
  chainId: '55516' | '80451';
  walletConnectProjectId: string;
  privyAppId: string;
  rpcEndpoint: string;
  apiEndpoint: string;
  bundlerRpcEndpoint: string;
  rpcEndpointTestnet: string;
  apiEndpointTestnet: string;
  zeroDevRpcUrlTestnet: string;
  accountAbstractionApiKey: string;
  isTestEnv: boolean;
  sentryDsn?: string;
}>;

export const variables: IVars = {
  chainId: '55516',
  isTestEnv: TEST_ENV === 'true',
  privyAppId: PRIVY_APP_ID!,
  rpcEndpoint: RPC_ENDPOINT!,
  apiEndpoint: API_ENDPOINT!,
  bundlerRpcEndpoint: BUNDLER_RPC_ENDPOINT!,
  rpcEndpointTestnet: RPC_ENDPOINT_TESTNET!,
  apiEndpointTestnet: API_ENDPOINT_TESTNET!,
  zeroDevRpcUrlTestnet: ZERODEV_RPC_URL_TESTNET!,
  walletConnectProjectId: WALLETCONNECT_PROJECT_ID!,
  accountAbstractionApiKey: ACCOUNT_ABSTRACTION_API_KEY!,
  sentryDsn: SENTRY_DSN,
};

export const getConfig = (): AppConfig => {
  const rpc = variables.chainId === '55516' ? variables.rpcEndpointTestnet : variables.rpcEndpoint;
  const api = variables.chainId === '55516' ? variables.apiEndpointTestnet : variables.apiEndpoint;

  // Testnet (55516) routes through ZeroDev: the URL is bundler + paymaster combined, with the
  // project id embedded in the path — no `?apikey=` suffix.
  // Mainnet (80451) routes through Pimlico, which uses the `?apikey=` query param.
  const bundler =
    variables.chainId === '55516'
      ? variables.zeroDevRpcUrlTestnet
      : `${variables.bundlerRpcEndpoint}?apikey=${variables.accountAbstractionApiKey}`;

  return {
    chainId: variables.chainId,
    rpc,
    api,
    bundler,
  };
};

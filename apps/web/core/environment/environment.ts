import {
  ACCOUNT_ABSTRACTION_API_KEY,
  API_ENDPOINT,
  API_ENDPOINT_TESTNET,
  BUNDLER_RPC_ENDPOINT,
  IS_LOCAL_DEV,
  LOCAL_CHAIN_ID,
  LOCAL_DAO_SPACE_FACTORY_ADDRESS,
  LOCAL_SPACE_REGISTRY_ADDRESS,
  PRIVY_APP_ID,
  RPC_ENDPOINT,
  RPC_ENDPOINT_TESTNET,
  SENTRY_DSN,
  TEST_ENV,
  WALLETCONNECT_PROJECT_ID,
  ZERODEV_RPC_URL_TESTNET,
} from './config';

type SupportedChainId = '1337' | '31337' | '80451' | '55516';

export type AppConfig = {
  chainId: SupportedChainId;
  rpc: string;
  api: string;
  bundler: string;
};

type LocalContractAddresses = Readonly<{
  spaceRegistry: `0x${string}`;
  daoSpaceFactory: `0x${string}`;
}>;

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
  isLocalDev: boolean;
  localChainId: SupportedChainId;
  localContracts: LocalContractAddresses | null;
  sentryDsn?: string;
}>;

const isLocalDev = IS_LOCAL_DEV === 'true';

export const variables: IVars = {
  chainId: '55516',
  isTestEnv: TEST_ENV === 'true',
  isLocalDev,
  // 1337 mirrors the test geobrowser branch's geth --dev default; override with
  // NEXT_PUBLIC_LOCAL_CHAIN_ID if the e2e stack runs at a different chain id (the
  // upstream docker-compose defaults CHAIN_ID=55516).
  localChainId: (LOCAL_CHAIN_ID ?? '1337') as SupportedChainId,
  localContracts: isLocalDev
    ? {
        spaceRegistry: LOCAL_SPACE_REGISTRY_ADDRESS as `0x${string}`,
        daoSpaceFactory: LOCAL_DAO_SPACE_FACTORY_ADDRESS as `0x${string}`,
      }
    : null,
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
  // In local-dev mode we reuse the testnet env slots (rpc/api) — they point at localhost per
  // the geobrowser.env.example template — and surface the local chain id. The local EOA
  // polyfill in `use-smart-account.ts` short-circuits before `generateSmartAccount` runs, so
  // the `bundler` field here is never read; we still pass the ZeroDev URL through for shape.
  if (variables.isLocalDev) {
    return {
      chainId: variables.localChainId,
      rpc: variables.rpcEndpointTestnet,
      api: variables.apiEndpointTestnet,
      bundler: variables.zeroDevRpcUrlTestnet,
    };
  }

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

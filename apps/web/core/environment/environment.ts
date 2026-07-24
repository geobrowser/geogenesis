import {
  API_ENDPOINT,
  API_ENDPOINT_TESTNET,
  CHAIN_ID,
  DAO_SPACE_FACTORY_ADDRESS,
  PRIVY_APP_ID,
  RPC_ENDPOINT,
  RPC_ENDPOINT_TESTNET,
  SENTRY_DSN,
  SPACE_REGISTRY_ADDRESS,
  SPONSORSHIP_RPC_URL,
  TEST_ENV,
  WALLETCONNECT_PROJECT_ID,
} from './config';

type SupportedChainId = '80451' | '55516';

export type AppConfig = {
  chainId: SupportedChainId;
  rpc: string;
  api: string;
};

const SUPPORTED_CHAIN_IDS = ['55516', '80451'] as const;
type ConfigurableChainId = (typeof SUPPORTED_CHAIN_IDS)[number];

// Defaults to testnet so existing deploys need no env change; validated so a
// typo'd chain id fails the build instead of silently selecting a network.
function resolveChainId(): ConfigurableChainId {
  if (!CHAIN_ID) return '55516';
  if (!(SUPPORTED_CHAIN_IDS as readonly string[]).includes(CHAIN_ID)) {
    throw new Error(`NEXT_PUBLIC_CHAIN_ID must be one of ${SUPPORTED_CHAIN_IDS.join(', ')}. Received: ${CHAIN_ID}`);
  }
  return CHAIN_ID as ConfigurableChainId;
}

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

// Empty string reads as "no override" so the vars can sit blank in env files
// as documented placeholders until a cutover fills them in.
function resolveAddressOverride(name: string, value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (!ADDRESS_PATTERN.test(value)) {
    throw new Error(`${name} must be a 0x-prefixed 20-byte hex address. Received: ${value}`);
  }
  return value;
}

// Same "empty reads as no override" convention as resolveAddressOverride.
function resolveUrlOverride(name: string, value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL. Received: ${value}`);
  }
  return value;
}

type IVars = Readonly<{
  chainId: '55516' | '80451';
  spaceRegistryAddress?: string;
  daoSpaceFactoryAddress?: string;
  sponsorshipRpcUrl?: string;
  walletConnectProjectId: string;
  privyAppId: string;
  rpcEndpoint: string;
  apiEndpoint: string;
  rpcEndpointTestnet: string;
  apiEndpointTestnet: string;
  isTestEnv: boolean;
  sentryDsn?: string;
}>;

export const variables: IVars = {
  chainId: resolveChainId(),
  spaceRegistryAddress: resolveAddressOverride('NEXT_PUBLIC_SPACE_REGISTRY_ADDRESS', SPACE_REGISTRY_ADDRESS),
  daoSpaceFactoryAddress: resolveAddressOverride('NEXT_PUBLIC_DAO_SPACE_FACTORY_ADDRESS', DAO_SPACE_FACTORY_ADDRESS),
  sponsorshipRpcUrl: resolveUrlOverride('NEXT_PUBLIC_SPONSORSHIP_RPC_URL', SPONSORSHIP_RPC_URL),
  isTestEnv: TEST_ENV === 'true',
  privyAppId: PRIVY_APP_ID!,
  rpcEndpoint: RPC_ENDPOINT!,
  apiEndpoint: API_ENDPOINT!,
  rpcEndpointTestnet: RPC_ENDPOINT_TESTNET!,
  apiEndpointTestnet: API_ENDPOINT_TESTNET!,
  walletConnectProjectId: WALLETCONNECT_PROJECT_ID!,
  sentryDsn: SENTRY_DSN,
};

export const getConfig = (): AppConfig => {
  const rpc = variables.chainId === '55516' ? variables.rpcEndpointTestnet : variables.rpcEndpoint;
  const api = variables.chainId === '55516' ? variables.apiEndpointTestnet : variables.apiEndpoint;

  return {
    chainId: variables.chainId,
    rpc,
    api,
  };
};

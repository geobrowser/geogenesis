import { GeoTestnetConfig } from '@geoprotocol/geo-sdk';

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

// The '55516' literals in this module are the geo-sdk's testnet chain id. Tie
// them together so an SDK chain change can't silently diverge from our types.
if (String(GeoTestnetConfig.chain?.id) !== '55516') {
  throw new Error(
    `geo-sdk testnet chain id is ${GeoTestnetConfig.chain?.id}, but this module assumes 55516 — update SupportedChainId.`
  );
}

const TESTNET_DEFAULT_RPC = GeoTestnetConfig.chain?.rpcUrl;
if (!TESTNET_DEFAULT_RPC) {
  throw new Error(
    'geo-sdk GeoTestnetConfig no longer ships a testnet RPC URL — set NEXT_PUBLIC_GEOGENESIS_RPC_TESTNET.'
  );
}

export type AppConfig = {
  chainId: SupportedChainId;
  rpc: string;
  api: string;
};

const SUPPORTED_CHAIN_IDS = ['55516', '80451'] as const;
type ConfigurableChainId = (typeof SUPPORTED_CHAIN_IDS)[number];

// The target network is always explicit. There is deliberately NO default:
// no env var positively signals "mainnet" (the endpoint vars were mandatory
// upstream and every existing deploy points them at testnet; the contract
// address overrides are also used for testnet contract cutovers), so any
// default here is a guess — and a guess is how a deploy ends up silently
// serving the wrong chain's data. Unset fails the build with the fix in the
// message; a typo'd value fails the same way.
function resolveChainId(): ConfigurableChainId {
  if (!CHAIN_ID) {
    throw new Error(
      `NEXT_PUBLIC_CHAIN_ID is not set. Set it to one of ${SUPPORTED_CHAIN_IDS.join(
        ', '
      )} (55516 = Geo testnet, 80451 = mainnet). There is no default — an implicit network is how a deploy ends up pointed at the wrong chain.`
    );
  }
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
  /** Mainnet endpoints — required only when chainId is '80451' (validated in getConfig). */
  rpcEndpoint?: string;
  apiEndpoint?: string;
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
  // `|| undefined` / `||` fallbacks: empty string reads as unset.
  rpcEndpoint: RPC_ENDPOINT || undefined,
  apiEndpoint: API_ENDPOINT || undefined,
  // Testnet endpoints ship inside the geo-sdk's network config; env vars are
  // overrides, not requirements.
  rpcEndpointTestnet: RPC_ENDPOINT_TESTNET || TESTNET_DEFAULT_RPC,
  apiEndpointTestnet: API_ENDPOINT_TESTNET || `${GeoTestnetConfig.apiOrigin}/graphql`,
  walletConnectProjectId: WALLETCONNECT_PROJECT_ID!,
  sentryDsn: SENTRY_DSN,
};

export const getConfig = (): AppConfig => {
  if (variables.chainId === '55516') {
    return {
      chainId: variables.chainId,
      rpc: variables.rpcEndpointTestnet,
      api: variables.apiEndpointTestnet,
    };
  }

  // The SDK has no mainnet config, so there is nothing to fall back to — fail
  // fast rather than let a half-configured mainnet build target the wrong place.
  if (!variables.rpcEndpoint || !variables.apiEndpoint) {
    throw new Error(
      `NEXT_PUBLIC_GEOGENESIS_RPC and NEXT_PUBLIC_API_ENDPOINT are required when NEXT_PUBLIC_CHAIN_ID=${variables.chainId}`
    );
  }

  return {
    chainId: variables.chainId,
    rpc: variables.rpcEndpoint,
    api: variables.apiEndpoint,
  };
};

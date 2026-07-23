// Not required, only set in test environments
const TEST_ENV = process.env.NEXT_PUBLIC_IS_TEST_ENV;

// OPTIONAL chain selector. Defaults to testnet (55516) when unset so existing
// deploys are unaffected; the eventual mainnet cutover flips this env var
// instead of editing code.
const CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID;

// OPTIONAL contract address overrides. When unset on testnet, the geo-sdk's
// built-in testnet addresses apply. REQUIRED on any non-testnet chain — the SDK
// only ships testnet addresses, and falling back silently is exactly the
// failure mode these exist to prevent (txs sent to a codeless address succeed
// with no events).
const SPACE_REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_SPACE_REGISTRY_ADDRESS;
const DAO_SPACE_FACTORY_ADDRESS = process.env.NEXT_PUBLIC_DAO_SPACE_FACTORY_ADDRESS;

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

if (!PRIVY_APP_ID) {
  throw new Error('NEXT_PUBLIC_PRIVY_APP_ID is not set');
}

const RPC_ENDPOINT = process.env.NEXT_PUBLIC_GEOGENESIS_RPC;

if (!RPC_ENDPOINT) {
  throw new Error('NEXT_PUBLIC_GEOGENESIS_RPC is not set');
}

const RPC_ENDPOINT_TESTNET = process.env.NEXT_PUBLIC_GEOGENESIS_RPC_TESTNET;

if (!RPC_ENDPOINT_TESTNET) {
  throw new Error('NEXT_PUBLIC_GEOGENESIS_RPC_TESTNET is not set');
}

const API_ENDPOINT = process.env.NEXT_PUBLIC_API_ENDPOINT;

if (!API_ENDPOINT) {
  throw new Error('NEXT_PUBLIC_API_ENDPOINT is not set');
}

const API_ENDPOINT_TESTNET = process.env.NEXT_PUBLIC_API_ENDPOINT_TESTNET;

if (!API_ENDPOINT_TESTNET) {
  throw new Error('NEXT_PUBLIC_API_ENDPOINT_TESTNET is not set');
}

const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

if (!WALLETCONNECT_PROJECT_ID) {
  throw new Error('NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set');
}

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (SENTRY_DSN) {
  try {
    const parsedDsn = new URL(SENTRY_DSN);

    if (parsedDsn.protocol !== 'http:' && parsedDsn.protocol !== 'https:') {
      throw new Error('NEXT_PUBLIC_SENTRY_DSN must use http or https');
    }
  } catch {
    throw new Error('NEXT_PUBLIC_SENTRY_DSN is not a valid URL');
  }
}

export {
  TEST_ENV,
  CHAIN_ID,
  SPACE_REGISTRY_ADDRESS,
  DAO_SPACE_FACTORY_ADDRESS,
  PRIVY_APP_ID,
  RPC_ENDPOINT,
  API_ENDPOINT,
  RPC_ENDPOINT_TESTNET,
  API_ENDPOINT_TESTNET,
  WALLETCONNECT_PROJECT_ID,
  SENTRY_DSN,
};

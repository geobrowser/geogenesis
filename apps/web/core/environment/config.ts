const APP_ENV = process.env.NEXT_PUBLIC_APP_ENV;

if (!APP_ENV) {
  throw new Error('NEXT_PUBLIC_APP_ENV is not set');
}

if (APP_ENV !== 'production' && APP_ENV !== 'testnet') {
  throw new Error(`Invalid value for NEXT_PUBLIC_APP_ENV: ${APP_ENV}`);
}

// Not required, only set in test environments
const TEST_ENV = process.env.NEXT_PUBLIC_IS_TEST_ENV;

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

if (!PRIVY_APP_ID) {
  throw new Error('NEXT_PUBLIC_PRIVY_APP_ID is not set');
}

const RPC_ENDPOINT = process.env.NEXT_PUBLIC_GEOGENESIS_RPC;

if (!RPC_ENDPOINT) {
  throw new Error('NEXT_PUBLIC_GEOGENESIS_RPC is not set');
}

const RPC_ENDPOINT_TESTNET = process.env.NEXT_PUBLIC_GEOGENESIS_RPC_TESTNET;

if (APP_ENV === 'testnet' && !RPC_ENDPOINT_TESTNET) {
  throw new Error('NEXT_PUBLIC_GEOGENESIS_RPC_TESTNET is not set. APP_ENV is currently set to testnet');
}

const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

if (!WALLETCONNECT_PROJECT_ID) {
  throw new Error('NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set');
}

const ACCOUNT_ABSTRACTION_API_KEY = process.env.NEXT_PUBLIC_PIMLICO_API_KEY;

if (!ACCOUNT_ABSTRACTION_API_KEY) {
  throw new Error('NEXT_PUBLIC_PIMLICO_API_KEY is not set');
}

const ONBOARD_FLAG = process.env.NEXT_PUBLIC_ONBOARD_FLAG;

if (!ONBOARD_FLAG) {
  throw new Error('NEXT_PUBLIC_ONBOARD_FLAG is not set');
}

const ONBOARD_CODE = process.env.NEXT_PUBLIC_ONBOARD_CODE;

if (!ONBOARD_CODE) {
  throw new Error('NEXT_PUBLIC_ONBOARD_CODE is not set');
}

export {
  APP_ENV,
  TEST_ENV,
  PRIVY_APP_ID,
  RPC_ENDPOINT,
  WALLETCONNECT_PROJECT_ID,
  ACCOUNT_ABSTRACTION_API_KEY,
  ONBOARD_FLAG,
  ONBOARD_CODE,
};

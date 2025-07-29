import { IPFS_GATEWAY_PATH } from '../constants';
import {
  ACCOUNT_ABSTRACTION_API_KEY,
  API_ENDPOINT,
  BUNDLER_RPC_ENDPOINT,
  CHAIN_ID,
  ONBOARD_CODE,
  ONBOARD_FLAG,
  PRIVY_APP_ID,
  RPC_ENDPOINT,
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
  accountAbstractionApiKey: string;
  isTestEnv: boolean;
  onboardFlag: string;
  onboardCode: string;
}>;

export const variables: IVars = {
  chainId: CHAIN_ID! as '19411' | '80451',
  isTestEnv: TEST_ENV === 'true',
  privyAppId: PRIVY_APP_ID!,
  rpcEndpoint: RPC_ENDPOINT!,
  apiEndpoint: API_ENDPOINT!,
  bundlerRpcEndpoint: BUNDLER_RPC_ENDPOINT!,
  walletConnectProjectId: WALLETCONNECT_PROJECT_ID!,
  accountAbstractionApiKey: ACCOUNT_ABSTRACTION_API_KEY!,
  onboardFlag: ONBOARD_FLAG!,
  onboardCode: ONBOARD_CODE!,
};

export const getConfig = (): AppConfig => {
  return {
    chainId: variables.chainId,
    rpc: variables.rpcEndpoint,
    ipfs: IPFS_GATEWAY_PATH,
    api: variables.apiEndpoint,
    bundler: `${variables.bundlerRpcEndpoint}?apikey=${variables.accountAbstractionApiKey}`,
  };
};

import { Config, Context, Effect, Option, Secret } from 'effect';

import { IPFS_GATEWAY_PATH } from '../constants';
import { AppEnv } from '../types';

type SupportedChainId = '31337' | '19411';

export type AppConfig = {
  chainId: SupportedChainId;
  rpc: string;
  ipfs: string;
  api: string;
};

export type IVars = Readonly<{
  liveBlocksPublicKey: string;
  appEnv: string;
  walletConnectProjectId: string;
  privyAppId: Secret.Secret;
  rpcEndpoint: Secret.Secret;
  geoPk: Secret.Secret;
  isTestEnv: boolean;
}>;

const make = Effect.gen(function* () {
  const liveBlocksPublicKey = yield* Config.string('NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY');
  const appEnv = yield* Config.string('NEXT_PUBLIC_APP_ENV');
  const walletConnectProjectId = yield* Config.string('NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID');
  const privyAppId = yield* Config.secret('NEXT_PUBLIC_PRIVY_APP_ID');
  const rpcEndpoint = yield* Config.secret('NEXT_PUBLIC_CONDUIT_TESTNET_RPC');
  const geoPk = yield* Config.secret('GEO_PK');

  const maybeIsTestEnv = yield* Config.option(Config.string('NEXT_PUBLIC_IS_TEST_ENV'));
  const isTestEnv = Option.match(maybeIsTestEnv, {
    onNone: () => false,
    onSome: value => (value === 'true' ? true : false),
  });

  return {
    liveBlocksPublicKey,
    appEnv,
    walletConnectProjectId,
    privyAppId,
    rpcEndpoint,
    geoPk,
    isTestEnv,
  } as const;
});

export class Vars extends Context.Tag('Vars')<Vars, IVars>() {}
export const VarsLive: IVars = Effect.runSync(make);

export const DEFAULT_ENV: AppEnv = 'production';

// @TODO: This eventually completely comes from our environment instead of hardcoded here.
// We can ensure our env matches the right schema in `make` above.
export const options: Record<AppEnv, AppConfig> = {
  development: {
    chainId: '31337',
    rpc: 'http://localhost:8545',
    ipfs: IPFS_GATEWAY_PATH,
    api: 'http://localhost:5001/graphql',
  },
  production: {
    chainId: '19411',
    rpc: Secret.value(VarsLive.rpcEndpoint),
    ipfs: IPFS_GATEWAY_PATH,
    api: 'https://geo-conduit.up.railway.app/graphql',
    // api: 'http://localhost:5001/graphql',
  },
  testnet: {
    chainId: '19411',
    rpc: Secret.value(VarsLive.rpcEndpoint),
    ipfs: IPFS_GATEWAY_PATH,
    api: 'https://geo-conduit.up.railway.app/graphql',
  },
};

export const getConfig = (): AppConfig => {
  const env = VarsLive.appEnv;

  if (!(env in options)) {
    console.error(`No config for env ${env}`);
    return options['production'];
  }

  return options[env as AppEnv];
};

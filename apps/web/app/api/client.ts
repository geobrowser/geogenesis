import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { Environment } from '~/core/environment';
import { GEOGENESIS } from '~/core/wallet/conduit-chain';
import { walletClientToSigner } from '~/core/wallet/wallet-client-to-signer';

import { ServerEnvironment } from './environment';

const geoAccount = privateKeyToAccount(ServerEnvironment.geoPk as `0x${string}`);

export const walletClient = createWalletClient({
  account: geoAccount,
  chain: GEOGENESIS,
  transport: http(Environment.variables.rpcEndpoint, { batch: true }),
});

export const publicClient = createPublicClient({
  chain: GEOGENESIS,
  transport: http(Environment.variables.rpcEndpoint, { batch: true }),
});

export const signer = walletClientToSigner(walletClient);

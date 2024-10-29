import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { Environment } from '~/core/environment';
import { CONDUIT_TESTNET } from '~/core/wallet/conduit-chain';
import { walletClientToSigner } from '~/core/wallet/wallet-client-to-signer';

const geoAccount = privateKeyToAccount(Environment.variables.geoPk as `0x${string}`);

export const walletClient = createWalletClient({
  account: geoAccount,
  chain: CONDUIT_TESTNET,
  transport: http(Environment.variables.rpcEndpoint, { batch: true }),
});

export const publicClient = createPublicClient({
  chain: CONDUIT_TESTNET,
  transport: http(Environment.variables.rpcEndpoint, { batch: true }),
});

export const signer = walletClientToSigner(walletClient);

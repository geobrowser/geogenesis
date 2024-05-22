import { Secret } from 'effect';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { VarsLive } from '~/core/environment/environment';
import { CONDUIT_TESTNET } from '~/core/wallet/conduit-chain';

export const geoAccount = privateKeyToAccount(Secret.value(VarsLive.geoPk) as `0x${string}`);

export const walletClient = createWalletClient({
  account: geoAccount,
  chain: CONDUIT_TESTNET,
  transport: http(Secret.value(VarsLive.rpcEndpoint), { batch: true }),
});

export const publicClient = createPublicClient({
  chain: CONDUIT_TESTNET,
  transport: http(Secret.value(VarsLive.rpcEndpoint), { batch: true }),
});

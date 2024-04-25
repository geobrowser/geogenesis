import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { CONDUIT_TESTNET } from '~/core/wallet/conduit-chain';

export const geoAccount = privateKeyToAccount(process.env.GEO_PK as `0x${string}`);

export const walletClient = createWalletClient({
  account: geoAccount,
  chain: CONDUIT_TESTNET,
  transport: http(process.env.NEXT_PUBLIC_CONDUIT_TESTNET_RPC, { batch: true }),
});

export const publicClient = createPublicClient({
  chain: CONDUIT_TESTNET,
  transport: http(process.env.NEXT_PUBLIC_CONDUIT_TESTNET_RPC, { batch: true }),
});
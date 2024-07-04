'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ENTRYPOINT_ADDRESS_V07,
  bundlerActions,
  createSmartAccountClient,
  walletClientToSmartAccountSigner,
} from 'permissionless';
import { signerToSafeSmartAccount } from 'permissionless/accounts';
import { pimlicoBundlerActions, pimlicoPaymasterActions } from 'permissionless/actions/pimlico';
import { useCookies } from 'react-cookie';
import { createClient, createPublicClient, http } from 'viem';

import { useWalletClient } from 'wagmi';

import { Cookie, WALLET_ADDRESS } from '../cookie';
import { Environment } from '../environment';
import { CONDUIT_TESTNET } from '../wallet/conduit-chain';

export function useSmartAccount() {
  const { data: walletClient } = useWalletClient();
  const [cookies] = useCookies([WALLET_ADDRESS]);

  const { data: smartAccount } = useQuery({
    queryKey: ['smart-account', walletClient?.account.address, cookies.walletAddress],
    queryFn: async () => {
      if (!walletClient) {
        return null;
      }

      const transport = http(process.env.NEXT_PUBLIC_CONDUIT_TESTNET_RPC!);
      const bundlerTransport = http(Environment.getConfig().bundler);

      const publicClient = createPublicClient({
        transport,
        chain: CONDUIT_TESTNET,
      });

      const signer = walletClientToSmartAccountSigner(walletClient);

      const safeAccount = await signerToSafeSmartAccount(publicClient, {
        signer: signer,
        entryPoint: ENTRYPOINT_ADDRESS_V07,
        safeVersion: '1.4.1',
      });

      const bundlerClient = createClient({
        transport: bundlerTransport,
        chain: CONDUIT_TESTNET,
      })
        .extend(bundlerActions(ENTRYPOINT_ADDRESS_V07))
        .extend(pimlicoBundlerActions(ENTRYPOINT_ADDRESS_V07));

      const paymasterClient = createClient({
        transport: bundlerTransport,
        chain: CONDUIT_TESTNET,
      }).extend(pimlicoPaymasterActions(ENTRYPOINT_ADDRESS_V07));

      const smartAccount = createSmartAccountClient({
        chain: CONDUIT_TESTNET,
        account: safeAccount,
        bundlerTransport,
        middleware: {
          gasPrice: async () => {
            return (await bundlerClient.getUserOperationGasPrice()).fast;
          },
          sponsorUserOperation: paymasterClient.sponsorUserOperation,
        },
      });

      // @TODO: Not sure what the performance implications of this are. I'm guessing this would
      // the app to re-render again when a user first logs in
      if (!cookies.walletAddress || cookies.walletAddress !== smartAccount.account.address) {
        await Cookie.onConnectionChange({ type: 'connect', address: smartAccount.account.address });
      }

      return smartAccount;
    },
  });

  return smartAccount ?? null;
}

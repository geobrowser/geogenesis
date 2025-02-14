'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ENTRYPOINT_ADDRESS_V07,
  bundlerActions,
  createSmartAccountClient,
  walletClientToSmartAccountSigner,
} from 'permissionless';
import { signerToSafeSmartAccount, signerToSimpleSmartAccount } from 'permissionless/accounts';
import { pimlicoBundlerActions, pimlicoPaymasterActions } from 'permissionless/actions/pimlico';
import { useCookies } from 'react-cookie';
import { createClient, createPublicClient, http } from 'viem';

import { useWalletClient } from 'wagmi';

import { Cookie, WALLET_ADDRESS } from '../cookie';
import { Environment } from '../environment';
import { GEOGENESIS } from '../wallet/geo-chain';

export function useSmartAccount() {
  const { data: walletClient, isLoading: isLoadingWallet } = useWalletClient();
  const [cookies] = useCookies([WALLET_ADDRESS]);

  const { data: smartAccount, isLoading } = useQuery({
    queryKey: ['smart-account', walletClient?.account.address, cookies.walletAddress],
    queryFn: async () => {
      if (!walletClient) {
        return null;
      }

      const transport = http(process.env.NEXT_PUBLIC_GEOGENESIS_RPC!);
      const bundlerTransport = http(Environment.getConfig().bundler);

      const publicClient = createPublicClient({
        transport,
        chain: GEOGENESIS,
      });

      const signer = walletClientToSmartAccountSigner(walletClient);

      // const safeAccount = await signerToSafeSmartAccount(publicClient, {
      //   signer: signer,
      //   entryPoint: ENTRYPOINT_ADDRESS_V07,
      //   safeVersion: '1.4.1',
      // });

      const safeAccount = await signerToSimpleSmartAccount(publicClient, {
        signer: signer,
        entryPoint: ENTRYPOINT_ADDRESS_V07,
        factoryAddress: '0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985',
      });

      const bundlerClient = createClient({
        transport: bundlerTransport,
        chain: GEOGENESIS,
      })
        .extend(bundlerActions(ENTRYPOINT_ADDRESS_V07))
        .extend(pimlicoBundlerActions(ENTRYPOINT_ADDRESS_V07));

      const paymasterClient = createClient({
        transport: bundlerTransport,
        chain: GEOGENESIS,
      }).extend(pimlicoPaymasterActions(ENTRYPOINT_ADDRESS_V07));

      const smartAccount = createSmartAccountClient({
        chain: GEOGENESIS,
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

  console.log('smart account', smartAccount);

  return { smartAccount: smartAccount ?? null, isLoading: isLoading || isLoadingWallet };
}

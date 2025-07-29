'use client';

import { useQuery } from '@tanstack/react-query';
import { createSmartAccountClient } from 'permissionless';
import { ToSafeSmartAccountParameters, toSafeSmartAccount } from 'permissionless/accounts';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { useCookies } from 'react-cookie';
import { createPublicClient, http } from 'viem';
import { entryPoint07Address } from 'viem/account-abstraction';

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

      const config = Environment.getConfig();

      const transport = http(config.rpc);
      const publicClient = createPublicClient({
        transport,
        chain: GEOGENESIS,
      });

      const safeAccountParams: ToSafeSmartAccountParameters<'0.7', undefined> = {
        client: publicClient,
        owners: [walletClient],
        entryPoint: {
          address: entryPoint07Address,
          version: '0.7',
        },
        version: '1.4.1',
      };

      // TESTNET
      if (GEOGENESIS.id === 19411) {
        // Custom SAFE Addresses
        // TODO: remove this once we have the smart sessions module deployed on testnet
        // (and the canonical addresses are deployed)
        safeAccountParams.safeModuleSetupAddress = '0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB5b47';
        safeAccountParams.safe4337ModuleAddress = '0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226';
        safeAccountParams.safeProxyFactoryAddress = '0xd9d2Ba03a7754250FDD71333F444636471CACBC4';
        safeAccountParams.safeSingletonAddress = '0x639245e8476E03e789a244f279b5843b9633b2E7';
        safeAccountParams.multiSendAddress = '0x7B21BBDBdE8D01Df591fdc2dc0bE9956Dde1e16C';
        safeAccountParams.multiSendCallOnlyAddress = '0x32228dDEA8b9A2bd7f2d71A958fF241D79ca5eEC';
      }

      const safeAccount = await toSafeSmartAccount(safeAccountParams);

      const bundlerTransport = http(config.bundler);
      const paymasterClient = createPimlicoClient({
        transport: bundlerTransport,
        chain: GEOGENESIS,
        entryPoint: {
          address: entryPoint07Address,
          version: '0.7',
        },
      });

      const smartAccount = createSmartAccountClient({
        chain: GEOGENESIS,
        account: safeAccount,
        paymaster: paymasterClient,
        bundlerTransport,
        userOperation: {
          estimateFeesPerGas: async () => {
            return (await paymasterClient.getUserOperationGasPrice()).fast;
          },
        },
      });

      if (!cookies.walletAddress || cookies.walletAddress !== smartAccount.account.address) {
        // We set a cookie with the connected user's address so we can fetch data while on the
        // server associated with the user. Since no data in Geo Genesis is private and all
        // permissions are onchain this is safe if someone decides to mess with the cookies.
        await Cookie.onConnectionChange({ type: 'connect', address: smartAccount.account.address });
      }

      return smartAccount;
    },
  });

  return { smartAccount: smartAccount ?? null, isLoading: isLoading || isLoadingWallet };
}

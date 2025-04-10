'use client';

import { useQuery } from '@tanstack/react-query';
import { createSmartAccountClient } from 'permissionless';
import { toSafeSmartAccount } from 'permissionless/accounts';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { useCookies } from 'react-cookie';
import { createPublicClient, http } from 'viem';
import { entryPoint07Address } from 'viem/account-abstraction';

import { useWalletClient } from 'wagmi';

import { Cookie, WALLET_ADDRESS } from '../cookie';
import { Environment } from '../environment';
import { GEOGENESIS } from '../wallet/geo-chain';

const ENTRY_POINT_07 =
  Environment.variables.appEnv === 'production' ? entryPoint07Address : '0xEB0a534440145D5A3aa512352FDDCf85453182b9';

export function useSmartAccount() {
  const { data: walletClient, isLoading: isLoadingWallet } = useWalletClient();
  const [cookies] = useCookies([WALLET_ADDRESS]);

  const { data: smartAccount, isLoading } = useQuery({
    queryKey: ['smart-account', walletClient?.account.address, cookies.walletAddress],
    queryFn: async () => {
      if (!walletClient) {
        return null;
      }

      if (Environment.variables.appEnv === 'testnet') {
        console.log('using wallet client');
        return walletClient;
      }

      const transport = http(Environment.getConfig().rpc);
      const bundlerTransport = http(Environment.getConfig().bundler);

      const publicClient = createPublicClient({
        transport,
        chain: GEOGENESIS,
      });

      const smartAccountImplementation = await toSafeSmartAccount({
        client: publicClient,
        owners: [walletClient],
        entryPoint: {
          version: '0.7',
          address: ENTRY_POINT_07,
        },
        version: '1.4.1',
      });

      const paymasterClient = createPimlicoClient({
        transport: bundlerTransport,
        chain: GEOGENESIS,
        entryPoint: {
          address: ENTRY_POINT_07,
          version: '0.7',
        },
      });

      const smartAccount = createSmartAccountClient({
        chain: GEOGENESIS,
        account: smartAccountImplementation,
        paymaster: paymasterClient,
        bundlerTransport,
        userOperation: {
          estimateFeesPerGas: async () => {
            return (await paymasterClient.getUserOperationGasPrice()).fast;
          },
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

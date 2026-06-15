'use client';

import { useWalletClient } from '@geogenesis/auth';
import { useQuery } from '@tanstack/react-query';

import { useCookies } from 'react-cookie';
import type { WalletClient } from 'viem';

import { Cookie, WALLET_ADDRESS } from '../cookie';
import { Environment } from '../environment';
import { GEOGENESIS } from '../wallet/geo-chain';

// Local-dev pseudo-smart-account backed by the connected wagmi EOA. The e2e stack has no
// Pimlico bundler running, so we can't mint a real ERC-4337 smart account. We expose the
// same surface downstream consumers expect (account.address, sendTransaction,
// sendUserOperation) and route everything directly through the EOA.
// Multi-call sendUserOperation requests log a warning and submit only the first call —
// fine for the common single-call edit/vote/execute paths.
function createLocalEoaAccount(walletClient: WalletClient) {
  if (!walletClient.account) {
    throw new Error('local-dev EOA polyfill: walletClient has no account');
  }
  const account = walletClient.account;

  return {
    account,
    sendTransaction: (params: { to: `0x${string}`; data: `0x${string}`; value?: bigint }) =>
      walletClient.sendTransaction({
        account,
        chain: walletClient.chain ?? null,
        to: params.to,
        data: params.data,
        value: params.value ?? 0n,
      }),
    sendUserOperation: (params: { calls: Array<{ to: `0x${string}`; data: `0x${string}`; value?: bigint }> }) => {
      if (params.calls.length === 0) {
        throw new Error('sendUserOperation called with no calls');
      }
      if (params.calls.length > 1) {
        // eslint-disable-next-line no-console
        console.warn(
          `[local-dev] sendUserOperation got ${params.calls.length} calls — EOA cannot batch; submitting only the first.`
        );
      }
      const [first] = params.calls;
      return walletClient.sendTransaction({
        account,
        chain: walletClient.chain ?? null,
        to: first.to,
        data: first.data,
        value: first.value ?? 0n,
      });
    },
  };
}

export function useSmartAccount() {
  const { data: walletClient, isLoading: isLoadingWallet } = useWalletClient();
  const [cookies] = useCookies([WALLET_ADDRESS]);

  const { data: smartAccount, isLoading } = useQuery({
    queryKey: [
      'smart-account',
      walletClient?.account.address,
      cookies.walletAddress,
      Environment.variables.isLocalDev,
    ],
    queryFn: async () => {
      if (!walletClient) {
        return null;
      }

      // Local-dev: skip the bundler/smart-account path entirely. Sign directly from the
      // injected EOA via wagmi.
      if (Environment.variables.isLocalDev) {
        const eoa = createLocalEoaAccount(walletClient);
        if (!cookies.walletAddress || cookies.walletAddress !== eoa.account.address) {
          await Cookie.onConnectionChange({ type: 'connect', address: eoa.account.address });
        }
        // eslint-disable-next-line no-console
        console.log('[local-dev] EOA smart-account wired:', eoa.account.address);
        return eoa as unknown as Awaited<ReturnType<typeof import('@geogenesis/auth/account').generateSmartAccount>>;
      }

      const config = Environment.getConfig();

      const { generateSmartAccount } = await import('@geogenesis/auth/account');

      const smartAccount = await generateSmartAccount({
        bundlerUrl: config.bundler,
        rpcUrl: config.rpc,
        chain: GEOGENESIS,
        walletClient,
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

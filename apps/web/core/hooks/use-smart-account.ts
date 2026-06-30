'use client';

import { toViemAccount, useWalletClient, useWallets } from '@geogenesis/auth';
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
  const { wallets } = useWallets();
  const [cookies] = useCookies([WALLET_ADDRESS]);

  // Privy embedded wallet — the EIP-7702 authority for chain 55516. We need this
  // separately from the wagmi WalletClient because viem's signAuthorization rejects
  // JSON-RPC accounts; only a viem LocalAccount built via Privy's toViemAccount has a
  // usable signAuthorization method.
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');

  const { data: smartAccount, isLoading } = useQuery({
    queryKey: [
      'smart-account',
      walletClient?.account.address,
      embeddedWallet?.address,
      cookies.walletAddress,
      Environment.variables.isLocalDev,
    ],
    queryFn: async () => {
      // Local-dev: skip Privy and the bundler entirely. Sign directly from the injected
      // EOA via wagmi. (Local-dev mounts wagmi without Privy on top.)
      if (Environment.variables.isLocalDev) {
        if (!walletClient) {
          return null;
        }
        const eoa = createLocalEoaAccount(walletClient);
        if (!cookies.walletAddress || cookies.walletAddress !== eoa.account.address) {
          await Cookie.onConnectionChange({ type: 'connect', address: eoa.account.address });
        }
        // eslint-disable-next-line no-console
        console.log('[local-dev] EOA smart-account wired:', eoa.account.address);
        return eoa as unknown as Awaited<ReturnType<typeof import('@geogenesis/auth/account').generateSmartAccount>>;
      }

      const config = Environment.getConfig();

      // Testnet (chain 55516): ZeroDev EIP-7702. Use the Privy embedded wallet as the
      // EOA signer — toViemAccount wraps it in a viem LocalAccount whose signAuthorization
      // routes through Privy's signing API (the wagmi WalletClient is JSON-RPC and would
      // be rejected by viem's signAuthorization action).
      if (config.chainId === '55516') {
        if (!embeddedWallet) {
          return null;
        }

        const signer = await toViemAccount({ wallet: embeddedWallet });

        const { generateZeroDevAccount } = await import('@geogenesis/auth/account');
        const zeroDevAccount = await generateZeroDevAccount({
          chain: GEOGENESIS,
          rpcUrl: config.rpc,
          zeroDevRpcUrl: config.bundler,
          // Cast: @privy-io/react-auth pins viem ^2.47.4 while apps/web pins ^2.48.1,
          // so the LocalAccount type identities don't match across the workspace boundary
          // even though the runtime shape is identical. Adding `viem` to the root overrides
          // would fix it cleanly but risks dragging other transitive deps along; the cast
          // is fine since both sides use the same structural shape.
          signer: signer as Parameters<typeof generateZeroDevAccount>[0]['signer'],
        });

        // Wrap sendUserOperation to wait for inclusion before returning. The kernel client's
        // default returns on bundler-accept; firing the next UserOp before the previous one
        // has advanced the on-chain nonce causes the bundler simulator to reject with AA25
        // ("invalid account nonce"). Waiting for the receipt makes each call submit + confirm.
        const kernel = zeroDevAccount as unknown as {
          waitForUserOperationReceipt: (a: { hash: `0x${string}` }) => Promise<unknown>;
        };
        const wrapped = {
          account: zeroDevAccount.account,
          sendTransaction: zeroDevAccount.sendTransaction.bind(zeroDevAccount),
          sendUserOperation: async (args: {
            calls: ReadonlyArray<{ to: `0x${string}`; data: `0x${string}`; value?: bigint }>;
          }) => {
            const hash = await zeroDevAccount.sendUserOperation(args);
            await kernel.waitForUserOperationReceipt({ hash });
            return hash;
          },
        };

        if (!cookies.walletAddress || cookies.walletAddress !== wrapped.account.address) {
          // The EOA address — registry now keys permissions on this directly (no Safe
          // indirection) so the cookie value matches what `SpaceRegistry.enter` sees.
          await Cookie.onConnectionChange({ type: 'connect', address: wrapped.account.address });
        }

        return wrapped as unknown as Awaited<
          ReturnType<typeof import('@geogenesis/auth/account').generateSmartAccount>
        >;
      }

      // Mainnet (80451): Safe + Pimlico. Owners-based — still needs the wagmi WalletClient.
      if (!walletClient) {
        return null;
      }

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

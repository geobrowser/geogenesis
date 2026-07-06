'use client';

import { toViemAccount, useWalletClient, useWallets } from '@geogenesis/auth';
import { useQuery } from '@tanstack/react-query';

import { useCookies } from 'react-cookie';

import { Cookie, WALLET_ADDRESS } from '../cookie';
import { Environment } from '../environment';
import { GEOGENESIS } from '../wallet/geo-chain';

export function useSmartAccount() {
  const { data: walletClient, isLoading: isLoadingWallet } = useWalletClient();
  const { wallets } = useWallets();
  const [cookies] = useCookies([WALLET_ADDRESS]);

  // Privy embedded wallet — the EIP-7702 authority for chain 55516. We need this
  // separately from the wagmi WalletClient because viem's signAuthorization rejects
  // JSON-RPC accounts; only a viem LocalAccount built via Privy's toViemAccount has a
  // usable signAuthorization method.
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');

  const { data: smartAccount, isLoading, error } = useQuery({
    queryKey: ['smart-account', walletClient?.account.address, embeddedWallet?.address, cookies.walletAddress],
    queryFn: async () => {
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
        // Since geo-sdk beta.8 the chain + sponsorship endpoints ship inside the SDK's
        // GeoTestnetConfig. rpcUrl/sponsorshipRpcUrl are overrides for the local-anvil
        // e2e env; on real testnet `sponsorship` is undefined and the SDK default applies.
        const zeroDevAccount = await generateZeroDevAccount({
          rpcUrl: config.rpc,
          sponsorshipRpcUrl: config.sponsorship,
          // Cast: @privy-io/react-auth pins viem ^2.47.4 while apps/web pins ^2.48.1,
          // so the LocalAccount type identities don't match across the workspace boundary
          // even though the runtime shape is identical. Adding `viem` to the root overrides
          // would fix it cleanly but risks dragging other transitive deps along; the cast
          // is fine since both sides use the same structural shape.
          signer: signer as Parameters<typeof generateZeroDevAccount>[0]['signer'],
        });

        // Two failure modes to defend against here:
        //
        // 1. AA25 nonce races: the kernel client computes the nonce at submit time,
        //    so two overlapping sends (a vote fired while a publish is pending, two
        //    sequential UserOps where the first is bundler-accepted but not yet
        //    included) compute the same nonce and the bundler simulator rejects the
        //    second. Fix: serialize every send — sendTransaction and
        //    sendUserOperation alike — through a single in-flight queue, and hold
        //    each sendUserOperation slot until its receipt confirms inclusion.
        //    (kernel sendTransaction already waits for its receipt internally.)
        //
        // 2. Duplicate submissions on retry: callers wrap sends in Effect.retry
        //    (~10s windows). Once the bundler has accepted a UserOp, a failure
        //    thrown from this wrapper makes those retries RE-SUBMIT an op that may
        //    already be landing — duplicate edit/comment/proposal on-chain. So
        //    after submission we only ever retry the receipt *wait*, and if the
        //    receipt still hasn't arrived we keep waiting until well past every
        //    caller's retry window before surfacing the failure (with the hash, so
        //    it's diagnosable). Submission is at-most-once by construction.
        const kernel = zeroDevAccount as unknown as {
          waitForUserOperationReceipt: (a: { hash: `0x${string}` }) => Promise<unknown>;
        };

        // Serialization queue. A failed send must not block the next one, so the
        // chained continuation swallows the error (the caller still sees it via
        // the returned promise).
        let sendChain: Promise<unknown> = Promise.resolve();
        const enqueue = <T,>(task: () => Promise<T>): Promise<T> => {
          const run = sendChain.then(task, task);
          sendChain = run.catch(() => undefined);
          return run;
        };

        // Longer than every caller retry window (max 10s today) plus slack, so a
        // surfaced receipt failure can't trigger a re-submission.
        const RECEIPT_DEADLINE_MS = 90_000;

        const confirmInclusion = async (hash: `0x${string}`) => {
          const startedAt = Date.now();
          let lastError: unknown;
          // waitForUserOperationReceipt polls internally but rejects on transient
          // RPC errors mid-poll. Retry the wait — never the submission.
          for (;;) {
            try {
              await kernel.waitForUserOperationReceipt({ hash });
              return;
            } catch (error) {
              lastError = error;
              if (Date.now() - startedAt >= RECEIPT_DEADLINE_MS) {
                throw new Error(
                  `UserOperation ${hash} was submitted but its receipt did not arrive within ${
                    RECEIPT_DEADLINE_MS / 1000
                  }s. It may still land on-chain — do not resubmit blindly.`,
                  { cause: lastError }
                );
              }
              await new Promise(resolve => setTimeout(resolve, 2_000));
            }
          }
        };

        const wrapped = {
          account: zeroDevAccount.account,
          sendTransaction: (...args: Parameters<typeof zeroDevAccount.sendTransaction>) =>
            enqueue(() => zeroDevAccount.sendTransaction(...args)),
          sendUserOperation: (args: {
            calls: ReadonlyArray<{ to: `0x${string}`; data: `0x${string}`; value?: bigint }>;
          }) =>
            enqueue(async () => {
              const hash = await zeroDevAccount.sendUserOperation(args);
              await confirmInclusion(hash);
              return hash;
            }),
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

  if (error) {
    // Without this, an init failure (Privy signing, ZeroDev RPC, 7702 kernel
    // setup) leaves consumers with smartAccount=null / isLoading=false —
    // indistinguishable from logged-out — and nothing in the logs.
    console.error('[SMART-ACCOUNT] initialization failed:', error);
  }

  return { smartAccount: smartAccount ?? null, isLoading: isLoading || isLoadingWallet, error: error ?? null };
}

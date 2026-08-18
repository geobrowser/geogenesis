import type { GeoWalletClient } from '@geogenesis/auth/account';
import { useQueryClient } from '@tanstack/react-query';

import { useCallback } from 'react';

import { Duration, Effect } from 'effect';

import { TransactionWriteFailedError } from '../errors';
import { useSmartAccount } from './use-smart-account';

type SendTxArgs = {
  to: `0x${string}`;
  data: `0x${string}`;
  value?: bigint;
};

function sanitizeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message.replace(/0x[a-fA-F0-9]{16,}/g, '[redacted-hex]').slice(0, 300);
  }

  return 'Transaction write failed';
}

/**
 * Returns an Effect-returning function that signs and submits a transaction via the
 * smart account. Each caller provides the destination `to` and `data` per call, which
 * lets us forward the `to` the SDK already returns rather than pinning a contract
 * address at hook setup.
 *
 * Sends are serialized with all other smart-account writes (see useSmartAccount), so
 * this call may queue behind a pending publish before it submits. Timeout layering:
 * the queue abandons any send that waits > MAX_QUEUE_WAIT_MS (120s) before starting
 * (QueuedSendTimeoutError — guaranteed never submitted, safe to retry), and the
 * post-submission receipt wait is bounded at 90s inside useSmartAccount. The outer
 * timeout below is only a backstop for a hung submission, so it must exceed both
 * bounds combined — if it raced them, it would report failure for a still-queued
 * send that later executes, and a user retry double-submits.
 */
export function useSmartAccountTransaction() {
  const { smartAccount } = useSmartAccount();
  const queryClient = useQueryClient();

  // Memoized so callers can put it in a `useCallback`/`useEffect` dependency list
  // without re-running on every render — `useRankingComposeAccess` fires its
  // membership check from an effect keyed on the callback it builds from this.
  const sendTransaction = useCallback(
    ({ to, data, value = 0n }: SendTxArgs) =>
      Effect.gen(function* () {
        const cachedAccounts = queryClient
          .getQueriesData<GeoWalletClient | null>({ queryKey: ['smart-account'] })
          .map(([, cached]) => cached)
          .filter((cached): cached is GeoWalletClient => Boolean(cached));
        const account = smartAccount ?? (cachedAccounts.length === 1 ? cachedAccounts[0] : null) ?? null;

        if (!account) {
          return yield* Effect.fail(new TransactionWriteFailedError('Missing smart account'));
        }

        if (!to) {
          return yield* Effect.fail(new TransactionWriteFailedError('Missing transaction target'));
        }

        const hash = yield* Effect.tryPromise({
          try: async () => {
            return await account.sendTransaction({
              to,
              value,
              data,
            });
          },
          catch: error => new TransactionWriteFailedError(sanitizeErrorMessage(error), { cause: error }),
        }).pipe(
          Effect.timeoutFail({
            // > MAX_QUEUE_WAIT_MS (120s) + the 90s receipt bound.
            duration: Duration.seconds(240),
            onTimeout: () =>
              new TransactionWriteFailedError(
                'Transaction timed out. It may have been submitted and could still land on-chain — check before retrying.'
              ),
          })
        );

        console.log('Transaction successful', hash);
        return hash;
      }).pipe(Effect.withSpan('web.write.sendTransaction')),
    [smartAccount, queryClient]
  );

  return sendTransaction;
}

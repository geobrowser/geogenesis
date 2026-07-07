import { Duration, Effect } from 'effect';

import { TransactionWriteFailedError } from '../errors';
import { useSmartAccount } from './use-smart-account';

type SendTxArgs = {
  to: `0x${string}`;
  data: `0x${string}`;
  value?: bigint;
};

/**
 * Returns an Effect-returning function that signs and submits a transaction via the
 * smart account. Each caller provides the destination `to` and `data` per call, which
 * lets us forward the `to` the SDK already returns rather than pinning a contract
 * address at hook setup.
 *
 * Sends are serialized with all other smart-account writes (see useSmartAccount), so
 * this call may queue behind a pending publish before it submits. Timeout layering:
 * the queue itself abandons any send that waits > 45s before starting
 * (QueuedSendTimeoutError — guaranteed never submitted, safe to retry), and the
 * post-submission receipt wait is bounded at 90s inside useSmartAccount. The outer
 * timeout below is only a backstop for a hung submission, so it must exceed both
 * bounds combined — if it raced them (as the old 45s did), it would report failure
 * for a still-queued send that later executes, and a user retry double-submits.
 */
export function useSmartAccountTransaction() {
  const { smartAccount } = useSmartAccount();

  const sanitizeErrorMessage = (error: unknown) => {
    if (error instanceof Error) {
      return error.message.replace(/0x[a-fA-F0-9]{16,}/g, '[redacted-hex]').slice(0, 300);
    }

    return 'Transaction write failed';
  };

  const sendTransaction = ({ to, data, value = 0n }: SendTxArgs) => {
    return Effect.gen(function* () {
      if (!smartAccount) {
        return yield* Effect.fail(new TransactionWriteFailedError('Missing smart account'));
      }

      if (!to) {
        return yield* Effect.fail(new TransactionWriteFailedError('Missing transaction target'));
      }

      const hash = yield* Effect.tryPromise({
        try: async () => {
          return await smartAccount.sendTransaction({
            to,
            value,
            data,
          });
        },
        catch: error => new TransactionWriteFailedError(sanitizeErrorMessage(error), { cause: error }),
      }).pipe(
        Effect.timeoutFail({
          duration: Duration.seconds(150),
          onTimeout: () =>
            new TransactionWriteFailedError(
              'Transaction timed out. It may have been submitted and could still land on-chain — check before retrying.'
            ),
        })
      );

      console.log('Transaction successful', hash);
      return hash;
    }).pipe(Effect.withSpan('web.write.sendTransaction'));
  };

  return sendTransaction;
}

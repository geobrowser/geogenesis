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
 * smart account (or local-dev EOA polyfill). Each caller provides the destination `to`
 * and `data` per call, which lets us forward the `to` the SDK already returns rather
 * than pinning a contract address at hook setup.
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
          duration: Duration.seconds(45),
          onTimeout: () => new TransactionWriteFailedError('Transaction timed out'),
        })
      );

      console.log('Transaction successful', hash);
      return hash;
    }).pipe(Effect.withSpan('web.write.sendTransaction'));
  };

  return sendTransaction;
}

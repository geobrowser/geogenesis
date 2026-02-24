import { Duration, Effect } from 'effect';

import { TransactionWriteFailedError } from '../errors';
import { useSmartAccount } from './use-smart-account';

interface Args {
  address: string | null;
}

export function useSmartAccountTransaction({ address }: Args) {
  const { smartAccount } = useSmartAccount();

  const sanitizeErrorMessage = (error: unknown) => {
    if (error instanceof Error) {
      return error.message.replace(/0x[a-fA-F0-9]{16,}/g, '[redacted-hex]').slice(0, 300);
    }

    return 'Transaction write failed';
  };

  const sendTransaction = (calldata: `0x${string}`) => {
    return Effect.gen(function* () {
      if (!smartAccount || !address) {
        return yield* Effect.fail(new TransactionWriteFailedError('Missing smart account or transaction target'));
      }

      const hash = yield* Effect.tryPromise({
        try: async () => {
          return await smartAccount.sendTransaction({
            to: address as `0x${string}`,
            value: 0n,
            data: calldata,
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

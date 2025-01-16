import { Effect } from 'effect';

import { TransactionWriteFailedError } from '../errors';
import { useSmartAccount } from './use-smart-account';

interface Args {
  address: string | null;
}

export function useSmartAccountTransaction({ address }: Args) {
  const smartAccount = useSmartAccount();

  const sendTransaction = (calldata: `0x${string}`) => {
    return Effect.gen(function* () {
      if (!smartAccount || !address) {
        console.log('nothing', smartAccount, address);
        return null;
      }

      console.log('stuff', smartAccount, address);

      const hash = yield* Effect.tryPromise({
        try: async () => {
          console.log('sending tx');
          return await smartAccount.sendTransaction({
            to: address as `0x${string}`,
            value: 0n,
            data: calldata,
          });
        },
        catch: error => new TransactionWriteFailedError(String(error)),
      });

      console.log('Transaction successful', hash);
      return hash;
    });
  };

  return sendTransaction;
}

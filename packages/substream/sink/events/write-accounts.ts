import { Effect } from 'effect';
import type * as S from 'zapatos/schema';

import { Accounts } from '../db';
import { CouldNotWriteAccountsError } from '../errors';

export const writeAccounts = (accounts: S.accounts.Insertable[]) =>
  Effect.gen(function* (_) {
    yield* _(Effect.logDebug('[WRITE ACCOUNTS] Started'));

    const result = yield* _(
      Effect.tryPromise({
        try: async () => {
          return await Accounts.upsert(accounts);
        },
        catch: error => new CouldNotWriteAccountsError(String(error)),
      })
    );

    yield* _(Effect.logDebug('[WRITE ACCOUNTS] Ended'));
    return result;
  });

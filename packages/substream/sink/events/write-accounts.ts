import { Effect } from 'effect';
import type * as S from 'zapatos/schema';

import { Accounts } from '../db';
import { CouldNotWriteAccountsError } from '../errors';
import { retryEffect } from '../utils/retry-effect';

export const writeAccounts = (accounts: S.accounts.Insertable[]) =>
  Effect.gen(function* (_) {
    yield* _(Effect.logDebug('Writing accounts'));

    const result = yield* _(
      Effect.tryPromise({
        try: async () => {
          return await Accounts.upsert(accounts);
        },
        catch: error => new CouldNotWriteAccountsError(String(error)),
      }),
      retryEffect
    );

    yield* _(Effect.logDebug(`Succesfully wrote accounts ${accounts.map(a => a.id).join(', ')}`));
    return result;
  });

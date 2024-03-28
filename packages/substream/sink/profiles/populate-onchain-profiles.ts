import { Effect, Schedule } from 'effect';
import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { getChecksumAddress } from '../utils/get-checksum-address';
import { pool } from '../utils/pool';
import type { OnchainProfileRegistered } from '../zod';

function retry(effect: Effect.Effect<void, Error>) {
  return Effect.retry(effect, Schedule.exponential(100).pipe(Schedule.jittered));
}

export function populateOnchainProfiles(profiles: OnchainProfileRegistered[], timestamp: number, blockNumber: number) {
  return Effect.gen(function* (unwrap) {
    const accounts = profiles.map(p => {
      const newAccount: S.accounts.Insertable = {
        id: getChecksumAddress(p.requestor),
      };

      return newAccount;
    });

    const spaces = profiles.map(p => {
      const newSpace: S.spaces.Insertable = {
        id: getChecksumAddress(p.space),
        created_at_block: blockNumber,
        is_root_space: false,
      };

      return newSpace;
    });

    const onchainProfiles = profiles.map(p => {
      const newOnchainProfile: S.onchain_profiles.Insertable = {
        id: `${getChecksumAddress(p.requestor)}–${p.id}`,
        account_id: getChecksumAddress(p.requestor),
        home_space_id: getChecksumAddress(p.space),
        created_at: timestamp,
        created_at_block: blockNumber,
      };

      return newOnchainProfile;
    });

    yield* unwrap(
      retry(
        Effect.tryPromise({
          try: () =>
            db
              .upsert('spaces', spaces, ['id'], {
                updateColumns: db.doNothing,
              })
              .run(pool),
          catch: error => {
            return new Error(`Failed to insert bulk spaces. ${(error as Error).message}`);
          },
        })
      )
    );

    yield* unwrap(
      retry(
        Effect.tryPromise({
          try: () =>
            db
              .upsert('accounts', accounts, ['id'], {
                updateColumns: db.doNothing,
              })
              .run(pool),
          catch: error => {
            return new Error(`Failed to insert bulk accounts. ${(error as Error).message}`);
          },
        })
      )
    );

    yield* unwrap(
      retry(
        Effect.tryPromise({
          try: () =>
            db
              .upsert('onchain_profiles', onchainProfiles, ['id'], {
                updateColumns: db.doNothing,
              })
              .run(pool),
          catch: error => {
            return new Error(`Failed to insert bulk onchain profiles. ${(error as Error).message}`);
          },
        })
      )
    );
  });
}

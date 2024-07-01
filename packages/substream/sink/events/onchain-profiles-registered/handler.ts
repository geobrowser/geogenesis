import { Effect, Either, Schedule } from 'effect';
import type * as S from 'zapatos/schema';

import type { OnchainProfileRegistered } from './parser';
import { Accounts, Spaces } from '~/sink/db';
import { OnchainProfiles } from '~/sink/db/onchain-profiles';
import { CouldNotWriteAccountsError, CouldNotWriteSpacesError } from '~/sink/errors';
import { Telemetry } from '~/sink/telemetry';
import type { GeoBlock } from '~/sink/types';
import { getChecksumAddress } from '~/sink/utils/get-checksum-address';
import { retryEffect } from '~/sink/utils/retry-effect';
import { slog } from '~/sink/utils/slog';

export class CouldNotWriteOnchainProfilesError extends Error {
  _tag: 'CouldNotWriteOnchainProfilesError' = 'CouldNotWriteOnchainProfilesError';
}

export function handleOnchainProfilesRegistered(profiles: OnchainProfileRegistered[], block: GeoBlock) {
  return Effect.gen(function* (unwrap) {
    const telemetry = yield* unwrap(Telemetry);

    const accounts = profiles.map(p => {
      const newAccount: S.accounts.Insertable = {
        id: getChecksumAddress(p.requestor),
      };

      return newAccount;
    });

    const spaces = profiles.map(p => {
      const newSpace: S.spaces.Insertable = {
        id: getChecksumAddress(p.space),
        dao_address: getChecksumAddress(p.space),
        type: 'personal',
        created_at_block: block.blockNumber,
        created_at_block_network: block.hash,
        created_at_block_hash: block.network,
        is_root_space: false,
      };

      return newSpace;
    });

    const onchainProfiles = profiles.map(p => {
      const newOnchainProfile: S.onchain_profiles.Insertable = {
        id: `${getChecksumAddress(p.requestor)}–${p.id}`,
        account_id: getChecksumAddress(p.requestor),
        home_space_id: getChecksumAddress(p.space),
        created_at: block.timestamp,
        created_at_block: block.blockNumber,
        created_at_block_network: block.hash,
        created_at_block_hash: block.network,
      };

      return newOnchainProfile;
    });

    const writtenSpaces = yield* unwrap(
      Effect.tryPromise({
        try: async () => {
          await Spaces.upsert(spaces);
        },
        catch: error => {
          return new CouldNotWriteSpacesError(String(error));
        },
      }),
      retryEffect,
      Effect.either
    );

    if (Either.isLeft(writtenSpaces)) {
      const error = writtenSpaces.left;
      telemetry.captureException(error);

      slog({
        level: 'error',
        requestId: block.requestId,
        message: `Could not write spaces when writing onchain profiles
          Cause: ${error.cause}
          Message: ${error.message}
        `,
      });

      return;
    }

    const writtenAccounts = yield* unwrap(
      Effect.tryPromise({
        try: async () => {
          await Accounts.upsert(accounts);
        },
        catch: error => {
          return new CouldNotWriteAccountsError(String(error));
        },
      }),
      retryEffect,
      Effect.either
    );

    if (Either.isLeft(writtenAccounts)) {
      const error = writtenAccounts.left;
      telemetry.captureException(error);

      slog({
        level: 'error',
        requestId: block.requestId,
        message: `Could not write accounts when writing onchain profiles
          Cause: ${error.cause}
          Message: ${error.message}
        `,
      });

      return;
    }

    const writtenProfiles = yield* unwrap(
      Effect.tryPromise({
        try: async () => {
          await OnchainProfiles.upsert(onchainProfiles);
        },
        catch: error => {
          return new CouldNotWriteOnchainProfilesError(String(error));
        },
      }),
      retryEffect,
      Effect.either
    );

    if (Either.isLeft(writtenProfiles)) {
      const error = writtenProfiles.left;
      telemetry.captureException(error);

      slog({
        level: 'error',
        requestId: block.requestId,
        message: `Could not write onchain profiles when writing onchain profiles
          Cause: ${error.cause}
          Message: ${error.message}
        `,
      });

      return;
    }

    slog({
      requestId: block.requestId,
      message: `Onchain profiles written successfully!`,
    });
  });
}

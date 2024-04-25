import { Effect, Either } from 'effect';

import { mapGovernanceToSpaces, mapSpaces } from './map-spaces';
import type { GovernancePluginsCreated, SpacePluginCreated } from './parser';
import { Spaces } from '~/sink/db';
import { CouldNotWriteSpacesError } from '~/sink/errors';
import type { BlockEvent } from '~/sink/types';
import { retryEffect } from '~/sink/utils/retry-effect';
import { slog } from '~/sink/utils/slog';

export class CouldNotWriteGovernancePlugins extends Error {
  _tag: 'CouldNotWriteGovernancePlugins' = 'CouldNotWriteGovernancePlugins';
}

export function handleSpacesCreated(spacesCreated: SpacePluginCreated[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    const spaces = mapSpaces(spacesCreated, block.blockNumber);

    slog({
      requestId: block.cursor,
      message: `Writing ${spaces.length} spaces to DB`,
    });

    const writtenSpaces = yield* _(
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

      slog({
        level: 'error',
        requestId: block.cursor,
        message: `Could not write spaces
          Cause: ${error.cause}
          Message: ${error.message}
        `,
      });

      return;
    }

    slog({
      requestId: block.cursor,
      message: `Spaces written successfully!`,
    });
  });
}

export function handleGovernancePluginCreated(governancePluginsCreated: GovernancePluginsCreated[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    const spaces = mapGovernanceToSpaces(governancePluginsCreated, block.blockNumber);

    slog({
      requestId: block.cursor,
      message: `Writing ${spaces.length} spaces with governance to DB`,
    });

    const writtenGovernancePlugins = yield* _(
      Effect.tryPromise({
        try: async () => {
          await Spaces.upsert(spaces);
        },
        catch: error => {
          return new CouldNotWriteGovernancePlugins(String(error));
        },
      }),
      retryEffect,
      Effect.either
    );

    if (Either.isLeft(writtenGovernancePlugins)) {
      const error = writtenGovernancePlugins.left;

      slog({
        level: 'error',
        requestId: block.cursor,
        message: `Could not write governance plugins for spaces
          Cause: ${error.cause}
          Message: ${error.message}
        `,
      });

      return;
    }

    slog({
      requestId: block.cursor,
      message: `Governance plugins written successfully!`,
    });
  });
}

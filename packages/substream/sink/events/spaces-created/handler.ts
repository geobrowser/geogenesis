import { Effect, Either } from 'effect';

import { mapGovernanceToSpaces, mapPersonalToSpaces, mapSpaces } from './map-spaces';
import type { GovernancePluginsCreated, PersonalPluginsCreated, SpacePluginCreatedWithSpaceId } from './parser';
import { Spaces } from '~/sink/db';
import { CouldNotWriteSpacesError } from '~/sink/errors';
import { Telemetry } from '~/sink/telemetry';
import type { BlockEvent } from '~/sink/types';
import { retryEffect } from '~/sink/utils/retry-effect';
import { slog } from '~/sink/utils/slog';

export class CouldNotWriteGovernancePlugins extends Error {
  _tag: 'CouldNotWriteGovernancePlugins' = 'CouldNotWriteGovernancePlugins';
}

export class CouldNotWritePersonalPlugins extends Error {
  _tag: 'CouldNotWritePersonalPlugins' = 'CouldNotWritePersonalPlugins';
}

export function handleSpacesCreated(spacesCreated: SpacePluginCreatedWithSpaceId[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    const telemetry = yield* _(Telemetry);
    const spaces = mapSpaces(spacesCreated, block.blockNumber);

    slog({
      requestId: block.requestId,
      message: `Writing ${spaces.length} spaces to DB`,
    });

    const writtenSpaces = yield* _(
      Effect.tryPromise({
        try: async () => {
          return await Spaces.upsert(spaces);
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
        message: `Could not write spaces
          Cause: ${error.cause}
          Message: ${error.message}
        `,
      });

      return null;
    }

    slog({
      requestId: block.requestId,
      message: `Spaces written successfully!`,
    });

    return writtenSpaces.right.map(s => s.id);
  });
}

export function handlePersonalSpacesCreated(personalPluginsCreated: PersonalPluginsCreated[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    const telemetry = yield* _(Telemetry);

    const personalPluginsWithSpaceId = (yield* _(
      Effect.all(
        personalPluginsCreated.map(p => {
          return Effect.gen(function* (_) {
            const maybeSpace = yield* _(Effect.promise(() => Spaces.findForDaoAddress(p.daoAddress)));

            if (maybeSpace === null) {
              yield* _(Effect.fail(new Error()));
              return null;
            }

            return {
              ...p,
              id: maybeSpace.id,
            };
          });
        }),
        {
          concurrency: 25,
        }
      )
    )).flatMap(g => (g ? [g] : []));

    const spaces = mapPersonalToSpaces(personalPluginsWithSpaceId, block.blockNumber);

    slog({
      requestId: block.requestId,
      message: `Writing ${spaces.length} spaces without governance to DB`,
    });

    const writtenGovernancePlugins = yield* _(
      Effect.tryPromise({
        try: async () => {
          await Spaces.upsert(spaces);
        },
        catch: error => {
          return new CouldNotWritePersonalPlugins(String(error));
        },
      }),
      retryEffect,
      Effect.either
    );

    if (Either.isLeft(writtenGovernancePlugins)) {
      const error = writtenGovernancePlugins.left;
      telemetry.captureException(error);

      slog({
        level: 'error',
        requestId: block.requestId,
        message: `Could not write personal plugins for spaces
          Cause: ${error.cause}
          Message: ${error.message}
        `,
      });

      return;
    }

    slog({
      requestId: block.requestId,
      message: `Personal plugins written successfully!`,
    });
  });
}

export function handleGovernancePluginCreated(governancePluginsCreated: GovernancePluginsCreated[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    const telemetry = yield* _(Telemetry);

    const governancePluginsWithSpaceId = (yield* _(
      Effect.all(
        governancePluginsCreated.map(g => {
          return Effect.gen(function* (_) {
            const maybeSpace = yield* _(Effect.promise(() => Spaces.findForDaoAddress(g.daoAddress)));

            if (maybeSpace === null) {
              yield* _(Effect.fail(new Error()));
              return null;
            }

            return {
              ...g,
              id: maybeSpace.id,
            };
          });
        }),
        {
          concurrency: 25,
        }
      )
    )).flatMap(g => (g ? [g] : []));

    const spaces = mapGovernanceToSpaces(governancePluginsWithSpaceId, block.blockNumber);

    slog({
      requestId: block.requestId,
      message: `Writing ${spaces.length} spaces with governance to DB`,
    });

    // @TODO:
    // - Should error each plugin independently
    // - We need to know the actual space address
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
      telemetry.captureException(error);

      slog({
        level: 'error',
        requestId: block.requestId,
        message: `Could not write governance plugins for spaces
          Cause: ${error.cause}
          Message: ${error.message}
        `,
      });

      return;
    }

    slog({
      requestId: block.requestId,
      message: `Governance plugins written successfully!`,
    });
  });
}

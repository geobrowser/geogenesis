import { Effect, Either } from 'effect';

import { mapGovernanceToSpaces, mapPersonalToSpaces, mapSpaces } from './map-spaces';
import type { GovernancePluginsCreated, PersonalPluginsCreated, SpacePluginCreatedWithSpaceId } from './parser';
import { Spaces } from '~/sink/db';
import { CouldNotWriteSpacesError } from '~/sink/errors';
import { Telemetry } from '~/sink/telemetry';
import type { BlockEvent } from '~/sink/types';
import { retryEffect } from '~/sink/utils/retry-effect';

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

    yield* _(Effect.logInfo('Handling spaces created'));

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
      yield* _(
        Effect.logError(`Could not write spaces
        Cause: ${error.cause}
        Message: ${error.message}
      `)
      );

      return null;
    }

    yield* _(Effect.logInfo('Spaces created'));
    return writtenSpaces.right.map(s => s.id);
  });
}

export function handlePersonalSpacesCreated(personalPluginsCreated: PersonalPluginsCreated[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    const telemetry = yield* _(Telemetry);

    yield* _(Effect.logInfo('Handling personal space plugins created'));
    yield* _(Effect.logDebug('Collecting spaces for personal plugins'));

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

    yield* _(Effect.logDebug('Updating spaces with personal space plugins'));
    const spaces = mapPersonalToSpaces(personalPluginsWithSpaceId, block.blockNumber);

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

      yield* _(
        Effect.logError(`Could not write personal plugins for spaces
        Cause: ${error.cause}
        Message: ${error.message}
      `)
      );

      return;
    }

    yield* _(Effect.logInfo('Personal space plugins created'));
  });
}

export function handleGovernancePluginCreated(governancePluginsCreated: GovernancePluginsCreated[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    const telemetry = yield* _(Telemetry);

    yield* _(Effect.logInfo('Handling public space plugins created'));
    yield* _(Effect.logDebug('Collecting spaces for public plugins'));

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

    yield* _(Effect.logDebug('Updating spaces with public space plugins'));
    const spaces = mapGovernanceToSpaces(governancePluginsWithSpaceId, block.blockNumber);

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

      yield* _(
        Effect.logError(`Could not write governance plugins for spaces
          Cause: ${error.cause}
          Message: ${error.message}
        `)
      );

      return;
    }

    yield* _(Effect.logInfo('Public space plugins created'));
  });
}

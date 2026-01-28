import { NetworkIds } from '~/sink/utils/sdk-compat';
import { Effect } from 'effect';

import { mapGovernanceToSpaces, mapPersonalToSpaces, mapSpaces } from './map-spaces';
import type { GovernancePluginsCreated, PersonalPluginsCreated, SpacePluginCreatedWithSpaceId } from './parser';
import { Spaces } from '~/sink/db';
import { CouldNotWriteSpacesError } from '~/sink/errors';
import type { BlockEvent } from '~/sink/types';
import { deriveSpaceId } from '~/sink/utils/id';
import { retryEffect } from '~/sink/utils/retry-effect';

export class CouldNotWriteGovernancePlugins extends Error {
  _tag: 'CouldNotWriteGovernancePlugins' = 'CouldNotWriteGovernancePlugins';
}

export class CouldNotWritePersonalPlugins extends Error {
  _tag: 'CouldNotWritePersonalPlugins' = 'CouldNotWritePersonalPlugins';
}

export function handleSpacesCreated(
  spacesCreated: SpacePluginCreatedWithSpaceId[],
  block: BlockEvent
): Effect.Effect<string[], CouldNotWriteSpacesError> {
  return Effect.gen(function* (_) {
    const spaces = mapSpaces(spacesCreated, block.blockNumber);
    yield* _(Effect.logInfo('[SPACES CREATED] Started'));

    const writtenSpaces = yield* _(
      Effect.tryPromise({
        try: async () => {
          return await Spaces.upsert(spaces);
        },
        catch: error => new CouldNotWriteSpacesError({ message: String(error) }),
      }),
      retryEffect
    );

    yield* _(Effect.logInfo('[SPACES CREATED] Ended'));
    return writtenSpaces.map(s => s.id);
  });
}

export function handlePersonalSpacesCreated(personalPluginsCreated: PersonalPluginsCreated[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    yield* _(Effect.logInfo('[PERSONAL SPACES CREATED] Started'));

    const personalPluginsWithSpaceId = personalPluginsCreated.map(p => {
      return {
        ...p,
        id: deriveSpaceId({ address: p.daoAddress, network: NetworkIds.GEO }),
      };
    });

    yield* _(Effect.logDebug('[PERSONAL SPACES CREATED] Updating spaces with personal space plugins'));
    const spaces = mapPersonalToSpaces(personalPluginsWithSpaceId, block.blockNumber);

    const writtenGovernancePlugins = yield* _(
      Effect.tryPromise({
        try: async () => {
          return await Spaces.upsert(spaces);
        },
        catch: error => {
          return new CouldNotWritePersonalPlugins(String(error));
        },
      }),
      retryEffect
    );

    yield* _(Effect.logInfo('[PERSONAL SPACES CREATED] Ended'));
    return writtenGovernancePlugins.map(p => p.id);
  });
}

export function handleGovernancePluginCreated(governancePluginsCreated: GovernancePluginsCreated[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    yield* _(Effect.logInfo('[PUBLIC SPACES CREATED] Started'));

    const governancePluginsWithSpaceId = governancePluginsCreated.map(g => {
      return {
        ...g,
        id: deriveSpaceId({ address: g.daoAddress, network: NetworkIds.GEO }),
      };
    });

    yield* _(Effect.logDebug('[PUBLIC SPACES CREATED] Updating spaces with governance plugins'));
    const spaces = mapGovernanceToSpaces(governancePluginsWithSpaceId, block.blockNumber);

    // @TODO:
    // - Should error each plugin independently
    yield* _(
      Effect.tryPromise({
        try: async () => {
          await Spaces.upsert(spaces);
        },
        catch: error => {
          return new CouldNotWriteGovernancePlugins(String(error));
        },
      }),
      retryEffect
    );

    yield* _(Effect.logInfo('[PUBLIC SPACES CREATED] Ended'));
  });
}

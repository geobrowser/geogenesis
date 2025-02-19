import { getChecksumAddress } from '@graphprotocol/grc-20';
import { Effect } from 'effect';
import type * as S from 'zapatos/schema';

import type { SubspaceAdded } from './parser';
import { Spaces } from '~/sink/db';
import { SpaceWithPluginAddressNotFoundError } from '~/sink/errors';

export function mapSubspaces({
  subspacesAdded,
  timestamp,
  blockNumber,
}: {
  subspacesAdded: SubspaceAdded[];
  timestamp: number;
  blockNumber: number;
}) {
  return Effect.gen(function* (_) {
    // Need to get the DAO/space address for the space plugin that emits the
    // SubspaceAdded event.
    const maybeSpacesForPlugins = yield* _(
      Effect.forEach(
        subspacesAdded,
        p =>
          Effect.tryPromise({
            try: () => Spaces.findForSpacePlugin(p.pluginAddress),
            catch: error => new SpaceWithPluginAddressNotFoundError(String(error)),
          }),
        {
          concurrency: 20,
        }
      )
    );

    const spacesForPlugins = maybeSpacesForPlugins
      .flatMap(s => (s ? [s] : []))
      // Removing any duplicates and transforming to a map for faster access speed later
      .reduce(
        (acc, s) => {
          // Can safely assert that s.main_voting_plugin_address is not null here
          // since we query using that column previously
          //
          // @TODO: There should be a way to return only not-null values using zapatos
          // maybe using `having`
          const checksumPluginAddress = getChecksumAddress(s.space_plugin_address!);

          if (!acc.has(checksumPluginAddress)) {
            acc.set(checksumPluginAddress, s.id);
          }

          return acc;
        },
        // Mapping of the plugin address to the space id
        new Map<string, string>()
      );

    const maybeSpaceIdsForSubspaceDaoAddress = yield* _(
      Effect.forEach(
        subspacesAdded,
        p =>
          Effect.tryPromise({
            try: () => Spaces.findForDaoAddress(p.subspace),
            catch: error => new SpaceWithPluginAddressNotFoundError(String(error)),
          }),
        {
          concurrency: 20,
        }
      )
    );

    const spacesForSubspaces = maybeSpaceIdsForSubspaceDaoAddress
      .flatMap(s => (s ? [s] : []))
      // Removing any duplicates and transforming to a map for faster access speed later
      .reduce(
        (acc, s) => {
          if (!acc.has(s.dao_address)) {
            acc.set(s.dao_address, s.id);
          }

          return acc;
        },
        // Mapping of the plugin address to the space id
        new Map<string, string>()
      );

    return subspacesAdded.map(({ subspace, pluginAddress }) => {
      const newSubspace: S.space_subspaces.Insertable = {
        parent_space_id: spacesForPlugins.get(getChecksumAddress(pluginAddress))!,
        subspace_id: spacesForSubspaces.get(getChecksumAddress(subspace))!,
        created_at: timestamp,
        created_at_block: blockNumber,
      };

      return newSubspace;
    });
  });
}

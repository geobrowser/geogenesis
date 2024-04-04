import { Effect } from 'effect';
import * as db from 'zapatos/db';

import { SpaceWithPluginAddressNotFoundError } from '../errors';
import { getChecksumAddress } from './get-checksum-address';
import { pool } from './pool';

/**
 * Events from our DAO-based contracts might be emitted from different contracts. e.g.,
 * voting-related events might come from the MainVoting plugin. We need to map these
 * events to the actual space_id (the DAO contract address).
 *
 * This function looks up the space-id for a given voting plugin address.
 *
 * @TODO: We should only emit events from the substream that map to spaces we track. We
 * can store the association between plugins and spaces in a substream store and emit it
 * along with the event instead of having to read from the DB every time we receive an
 * event that comes from a plugin.
 */
export function getSpaceForMembershipPlugin(
  pluginAddress: `0x${string}`
): Effect.Effect<`0x${string}` | null, SpaceWithPluginAddressNotFoundError> {
  return Effect.gen(function* (unwrap) {
    const spaceExistsForPluginAddress = yield* unwrap(
      Effect.tryPromise({
        try: () =>
          db
            .selectOne(
              'spaces',
              { member_access_plugin_address: getChecksumAddress(pluginAddress) },
              { columns: ['id'] }
            )
            .run(pool),
        catch: error => new SpaceWithPluginAddressNotFoundError(),
      })
    );

    return spaceExistsForPluginAddress ? getChecksumAddress(spaceExistsForPluginAddress.id) : null;
  });
}

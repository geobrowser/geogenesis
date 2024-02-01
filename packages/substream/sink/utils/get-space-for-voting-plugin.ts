import { Effect } from 'effect';
import * as db from 'zapatos/db';

import { SpaceWithPluginAddressNotFoundError } from '../errors';
import { getChecksumAddress } from './get-checksum-address';
import { pool } from './pool';

// @TODO: We should only emit events from the substream that map to spaces we track
export function getSpaceForVotingPlugin(
  pluginAddress: `0x${string}`
): Effect.Effect<never, SpaceWithPluginAddressNotFoundError, `0x${string}` | null> {
  return Effect.gen(function* (unwrap) {
    const spaceExistsForPluginAddress = yield* unwrap(
      Effect.tryPromise({
        try: () =>
          db
            .selectOne('spaces', { main_voting_plugin_address: getChecksumAddress(pluginAddress) }, { columns: ['id'] })
            .run(pool),
        catch: error => new SpaceWithPluginAddressNotFoundError(),
      })
    );

    return spaceExistsForPluginAddress ? getChecksumAddress(spaceExistsForPluginAddress.id) : null;
  });
}

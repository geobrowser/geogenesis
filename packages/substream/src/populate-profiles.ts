import { getAddress } from 'viem';
import * as db from 'zapatos/db';
import type * as Schema from 'zapatos/schema';

import { upsertChunked } from './utils/db';
import type { ProfileRegistered } from './zod';

export async function populateProfiles({
  profilesRegistered,
  blockNumber,
  timestamp,
}: {
  profilesRegistered: ProfileRegistered[];
  blockNumber: number;
  timestamp: number;
}) {
  const profiles: Schema.profiles.Insertable[] = profilesRegistered.map(profile => ({
    id: profile.id,
    space_id: getAddress(profile.space),
    created_at_block: blockNumber,
    created_at: timestamp,
    created_by_id: getAddress(profile.requestor),
    // entity_id: `${profile.requestor}–${profile.id}`,
  }));

  await upsertChunked('profiles', profiles, 'id', {
    updateColumns: db.doNothing,
  });
}

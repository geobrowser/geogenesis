import { Effect } from 'effect';

import { createBatchLoader } from '~/core/io/batch-loader';
import type { Profile } from '~/core/types';

import { fetchProfilesBySpaceIds } from './fetch-profile';

/** The API's POST /profile/batch chokes on unbounded id lists, so split large flushes. */
const MAX_BATCH_SIZE = 100;

/**
 * Fetch one profile by space id, coalescing every call made in the same tick into a single
 * POST /profile/batch. See `createBatchLoader`.
 *
 * This exists so profiles can be cached per space id — see `profileBySpaceIdQueryKey` — without
 * paying a request per avatar. A group of avatars mounts in one commit, so all of its lookups
 * land in the same microtask and go out together.
 */
export const loadProfileBySpaceId = createBatchLoader<Profile>({
  fetchBatch: async spaceIds => {
    const profiles = await Effect.runPromise(fetchProfilesBySpaceIds(spaceIds));
    const bySpaceId = new Map<string, Profile>();
    spaceIds.forEach((spaceId, index) => {
      const profile = profiles[index];
      if (profile) bySpaceId.set(spaceId, profile);
    });
    return bySpaceId;
  },
  // fetchProfilesBySpaceIds returns one entry per requested id, so a hole here means the contract
  // changed rather than that the profile is missing.
  missing: spaceId => {
    throw new Error(`No profile returned for space ${spaceId}`);
  },
  maxBatchSize: MAX_BATCH_SIZE,
});

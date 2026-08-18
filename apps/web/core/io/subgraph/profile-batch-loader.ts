import { Effect } from 'effect';

import type { Profile } from '~/core/types';

import { fetchProfilesBySpaceIds } from './fetch-profile';

/** The API's POST /profile/batch chokes on unbounded id lists, so split large flushes. */
const MAX_BATCH_SIZE = 100;

type PendingRequest = {
  resolve: (profile: Profile) => void;
  reject: (error: unknown) => void;
};

let queued: Map<string, PendingRequest[]> | null = null;

function flush() {
  const batch = queued;
  queued = null;
  if (!batch) return;

  const spaceIds = [...batch.keys()];

  for (let start = 0; start < spaceIds.length; start += MAX_BATCH_SIZE) {
    const chunk = spaceIds.slice(start, start + MAX_BATCH_SIZE);

    void Effect.runPromise(fetchProfilesBySpaceIds(chunk)).then(
      profiles => {
        chunk.forEach((spaceId, index) => {
          const profile = profiles[index];
          for (const request of batch.get(spaceId) ?? []) {
            // fetchProfilesBySpaceIds returns one entry per requested id, so a hole here
            // means the contract changed rather than that the profile is missing.
            if (profile) request.resolve(profile);
            else request.reject(new Error(`No profile returned for space ${spaceId}`));
          }
        });
      },
      error => {
        for (const spaceId of chunk) {
          for (const request of batch.get(spaceId) ?? []) request.reject(error);
        }
      }
    );
  }
}

/**
 * Fetch one profile by space id, coalescing every call made in the same tick into a single
 * POST /profile/batch.
 *
 * This exists so profiles can be cached per space id — see `profileBySpaceIdQueryKey` — without
 * paying a request per avatar. A group of avatars mounts in one commit, so all of its lookups
 * land in the same microtask and go out together.
 */
export function loadProfileBySpaceId(spaceId: string): Promise<Profile> {
  return new Promise<Profile>((resolve, reject) => {
    if (!queued) {
      queued = new Map();
      queueMicrotask(flush);
    }

    const existing = queued.get(spaceId);
    if (existing) existing.push({ resolve, reject });
    else queued.set(spaceId, [{ resolve, reject }]);
  });
}

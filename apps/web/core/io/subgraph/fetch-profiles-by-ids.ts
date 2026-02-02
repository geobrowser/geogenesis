import { Effect } from 'effect';

import { fetchProfile, fetchProfilesBySpaceIds as fetchProfilesBySpaceIdsBatch } from './fetch-profile';

export async function fetchProfilesByAddresses(addresses: string[]) {
  const uniques = [...new Set(addresses).values()];
  return await Effect.runPromise(Effect.all(uniques.map(address => fetchProfile(address))));
}

/**
 * Fetch profiles by personal space IDs (memberSpaceIds) in a single batch request.
 * Use this for v2 API where editors/members are identified by their personal space ID.
 */
export async function fetchProfilesBySpaceIds(spaceIds: string[]) {
  return await Effect.runPromise(fetchProfilesBySpaceIdsBatch(spaceIds));
}

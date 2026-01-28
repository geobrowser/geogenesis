import { fetchProfile, fetchProfileBySpaceId } from './fetch-profile';

export async function fetchProfilesByAddresses(addresses: string[]) {
  const uniques = [...new Set(addresses).values()];
  return await Promise.all(uniques.map(address => fetchProfile({ walletAddress: address })));
}

/**
 * Fetch profiles by personal space IDs (memberSpaceIds).
 * Use this for v2 API where editors/members are identified by their personal space ID.
 */
export async function fetchProfilesBySpaceIds(spaceIds: string[]) {
  const uniques = [...new Set(spaceIds).values()];
  return await Promise.all(uniques.map(spaceId => fetchProfileBySpaceId(spaceId)));
}

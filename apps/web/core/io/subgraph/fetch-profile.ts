import { Profile } from '~/core/types';

import { defaultProfile, fetchProfileViaWalletsTripleAddress } from './fetch-profile-via-wallets-triple';

export interface FetchProfileOptions {
  address: string;
}

export async function fetchProfile(options: FetchProfileOptions): Promise<Profile> {
  // For now we're using the wallets field on entities to read wallet associations
  return defaultProfile(options.address);
  // return await fetchProfileViaWalletsTripleAddress(options.address);
}

import { Profile } from '~/core/types';

import { fetchProfileViaWalletsTripleAddress } from './fetch-profile-via-wallets-triple';

export interface FetchProfileOptions {
  address: string;
}

export async function fetchProfile(options: FetchProfileOptions): Promise<Profile> {
  return await fetchProfileViaWalletsTripleAddress(options.address);

  // For now we're using the wallets field on entities to read wallet associations
  // const onchainProfile = await fetchOnchainProfile({
  //   address: options.address,
  // });

  // if (!onchainProfile) {
  //   return null;
  // }

  // const profile = await fetchEntity({
  //   id: onchainProfile.id,
  // });

  // if (!profile) {
  //   return null;
  // }

  // return {
  //   id: profile.id,
  //   name: profile.name,
  //   avatarUrl: Entities.avatar(profile.triples),
  //   coverUrl: Entities.cover(profile.triples),
  //   profileLink: NavUtils.toEntity(onchainProfile.homeSpaceId, onchainProfile.id),
  //   address: onchainProfile.accountId as `0x${string}`,
  // };
}

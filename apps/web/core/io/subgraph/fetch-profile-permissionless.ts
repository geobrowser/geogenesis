import { Profile } from '~/core/types';
import { Entity } from '~/core/utils/entity';
import { NavUtils } from '~/core/utils/utils';

import { fetchEntity } from './fetch-entity';
import { fetchOnchainProfile } from './fetch-on-chain-profile';

export interface FetchProfilePermissionlessOptions {
  address: string;
}

export async function fetchProfilePermissionless(options: FetchProfilePermissionlessOptions): Promise<Profile | null> {
  const onchainProfile = await fetchOnchainProfile({
    address: options.address,
  });

  if (!onchainProfile) {
    return null;
  }

  const profile = await fetchEntity({
    id: onchainProfile.id,
  });

  if (!profile) {
    return null;
  }

  return {
    id: profile.id,
    name: profile.name,
    avatarUrl: Entity.avatar(profile.triples),
    coverUrl: Entity.cover(profile.triples),
    profileLink: NavUtils.toEntity(onchainProfile.homeSpaceId, onchainProfile.id),
    address: onchainProfile.accountId as `0x${string}`,
  };
}

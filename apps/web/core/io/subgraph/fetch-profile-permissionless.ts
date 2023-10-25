import { Environment } from '~/core/environment';
import { Profile } from '~/core/types';
import { Entity } from '~/core/utils/entity';
import { NavUtils } from '~/core/utils/utils';

import { fetchEntity } from './fetch-entity';
import { fetchOnchainProfile } from './fetch-on-chain-profile';

export interface FetchProfilePermissionlessOptions {
  address: string;
}

export async function fetchProfilePermissionless(options: FetchProfilePermissionlessOptions): Promise<Profile | null> {
  const config = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV);

  const onchainProfile = await fetchOnchainProfile({
    address: options.address,
    endpoint: config.profileSubgraph,
  });

  if (!onchainProfile) {
    return null;
  }

  const profile = await fetchEntity({
    endpoint: config.permissionlessSubgraph,
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
    profileLink: NavUtils.toEntity(onchainProfile.homeSpace, onchainProfile.id),
    address: onchainProfile.account as `0x${string}`,
  };
}

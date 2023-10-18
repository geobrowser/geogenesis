import { Environment } from '~/core/environment';
import { Profile } from '~/core/types';
import { Entity } from '~/core/utils/entity';
import { NavUtils } from '~/core/utils/utils';

import { fetchEntity } from './fetch-entity';
import { fetchOnchainProfile } from './fetch-on-chain-profile';

export interface FetchProfilePermissionlessOptions {
  endpoint: string;
  address: string;
  signal?: AbortController['signal'];
}

export async function fetchProfilePermissionless(options: FetchProfilePermissionlessOptions): Promise<Profile | null> {
  const onchainProfile = await fetchOnchainProfile({
    address: options.address,
    endpoint: Environment.options.production.profileSubgraph,
  });

  if (!onchainProfile) {
    return null;
  }

  const profile = await fetchEntity({
    endpoint: Environment.options.production.permissionlessSubgraph,
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
    homeSpaceLink: NavUtils.toEntity(onchainProfile.homeSpace, onchainProfile.id),
  };
}

import { SYSTEM_IDS } from '@geobrowser/gdk';

import { Profile } from '~/core/types';
import { Entities } from '~/core/utils/entity';
import { NavUtils } from '~/core/utils/utils';

import { fetchEntities } from './fetch-entities';

export async function fetchProfileViaWalletsTripleAddress(address: string): Promise<Profile> {
  const entities = await fetchEntities({
    filter: [
      {
        field: 'attribute-id',
        value: SYSTEM_IDS.WALLETS_ATTRIBUTE,
      },
      {
        field: 'value',
        value: address,
      },
    ],
  });

  if (entities.length === 0) {
    return {
      id: address,
      name: null,
      avatarUrl: null,
      coverUrl: null,
      address: address as `0x${string}`,
      profileLink: null,
    };
  }

  const profile = entities[0];
  const space = profile.nameTripleSpaces?.[0];

  return {
    id: profile.id,
    name: profile.name,
    avatarUrl: Entities.avatar(profile.relationsOut),
    coverUrl: Entities.cover(profile.relationsOut),
    profileLink: space ? NavUtils.toEntity(space, profile.id) : null,
    address: address as `0x${string}`,
  };
}

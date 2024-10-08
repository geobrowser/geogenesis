import { Profile } from '~/core/types';

import { SubstreamVersion } from '../schema';
import { Entity, EntityDto } from './entities';

export type Version = Entity & {
  createdAt: number;
  createdBy: Profile;
  editName: string;
};

export function VersionDto(version: SubstreamVersion): Version {
  // @TODO: This should probably be inversed where the EntityDto accepts a version
  return {
    ...EntityDto({
      id: version.entityId,
      currentVersion: {
        version,
      },
    }),
    editName: 'askdlj',
    createdAt: 0,
    createdBy: {
      address: '0x00',
      avatarUrl: '',
      coverUrl: '',
      id: '',
      name: '',
      profileLink: '',
    },
  };
}

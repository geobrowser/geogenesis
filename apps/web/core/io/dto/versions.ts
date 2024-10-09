import { Profile } from '~/core/types';

import { SubstreamVersion } from '../schema';
import { Entity, EntityDto } from './entities';

export type Version = Entity & {
  createdAt: number;
  createdBy: Profile;
  editName: string;
  versionId: string;
};

export function VersionDto(version: SubstreamVersion): Version {
  return {
    ...EntityDto({
      id: version.entityId,
      currentVersion: {
        version,
      },
    }),
    versionId: version.id,
    editName: version.edit.name,
    createdAt: version.edit.createdAt,
    createdBy: {
      address: version.edit.createdById as `0x${string}`,
      avatarUrl: '',
      coverUrl: '',
      id: version.edit.createdById,
      name: null,
      profileLink: '',
    },
  };
}

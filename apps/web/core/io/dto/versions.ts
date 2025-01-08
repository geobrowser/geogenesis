import { Profile } from '~/core/types';

import { SubstreamVersion, SubstreamVersionWithEdit } from '../schema';
import { Entity, EntityDto } from './entities';

export type Version = Entity;

export type HistoryVersion = Entity & {
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
  };
}

export function HistoryVersionDto(version: SubstreamVersionWithEdit): HistoryVersion {
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

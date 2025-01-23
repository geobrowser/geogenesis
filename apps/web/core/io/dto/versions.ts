import { Profile } from '~/core/types';

import { SubstreamVersion, SubstreamVersionHistorical } from '../schema';
import { Entity, EntityDtoHistorical, EntityDtoLive } from './entities';

export type Version = Entity & {
  versionId: string;
};

export type HistoryVersion = Entity & {
  createdAt: number;
  createdBy: Profile;
  editName: string;
  versionId: string;
  proposalId: string;
};

export function VersionDto(version: SubstreamVersion): Version {
  return {
    ...EntityDtoLive({
      id: version.entityId,
      currentVersion: {
        version,
      },
    }),
    versionId: version.id,
  };
}

export function HistoryVersionDto(version: SubstreamVersionHistorical, profile?: Profile): HistoryVersion {
  return {
    ...EntityDtoHistorical({
      id: version.entityId,
      currentVersion: {
        version,
      },
    }),
    versionId: version.id,
    editName: version.edit.name,
    proposalId: version.edit.proposals.nodes[0].id,
    createdAt: version.edit.createdAt,
    createdBy: profile ?? {
      address: version.edit.createdById as `0x${string}`,
      avatarUrl: '',
      coverUrl: '',
      id: version.edit.createdById,
      name: null,
      profileLink: '',
    },
  };
}

import { Profile } from '~/core/types';
import { Entity } from '~/core/v2.types';

import { SubstreamVersion, SubstreamVersionHistorical } from '../schema';
import { RemoteEntity } from '../v2/v2.schema';
import { EntityDtoHistorical, EntityDtoLive } from './entities';

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
    // @TODO(migration): Fix types
    ...EntityDtoLive(version as unknown as RemoteEntity),
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
    // @TODO(migration): Fix types
  } as unknown as HistoryVersion;
}

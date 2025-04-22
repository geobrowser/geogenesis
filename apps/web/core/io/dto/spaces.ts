import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { SpaceGovernanceType } from '~/core/types';
import { Entities } from '~/core/utils/entity';

import { Address, EntityId, type Address as IAddress, SpaceId, SubstreamSpace, SubstreamVersion } from '../schema';
import { Entity } from './entities';
import { VersionDto } from './versions';

export type Space = {
  id: SpaceId;
  entityId: EntityId;
  type: SpaceGovernanceType;
  editors: string[];
  members: string[];
  spaceConfig: SpaceConfigEntity;
  daoAddress: IAddress;
  spacePluginAddress: IAddress;
  mainVotingPluginAddress: Address | null;
  memberAccessPluginAddress: Address | null;
  personalSpaceAdminPluginAddress: Address | null;
};

export type SpaceConfigEntity = Entity & {
  spaceId: string;
  image: string;
};

export function SpaceDto(space: SubstreamSpace): Space {
  const spaceConfigEntity = SpaceMetadataDto(space.id, space.spacesMetadatum?.version);

  return {
    id: space.id,
    entityId: spaceConfigEntity.id,
    type: space.type,
    editors: space.spaceEditors.nodes.map(editor => editor.accountId),
    members: space.spaceMembers.nodes.map(member => member.accountId),
    spaceConfig: spaceConfigEntity,

    daoAddress: space.daoAddress,
    mainVotingPluginAddress: space.mainVotingPluginAddress,
    memberAccessPluginAddress: space.memberAccessPluginAddress,
    personalSpaceAdminPluginAddress: space.personalSpaceAdminPluginAddress,
    spacePluginAddress: space.spacePluginAddress,
  };
}

export function SpaceMetadataDto(spaceId: string, metadata: SubstreamVersion | undefined | null): SpaceConfigEntity {
  const maybeEntity = metadata ? VersionDto(metadata) : null;

  let entity = null;

  if (maybeEntity) {
    entity = {
      ...maybeEntity,
      triples: maybeEntity.triples.filter(triple => triple.space === spaceId),
      relationsOut: maybeEntity.relationsOut.filter(relation => relation.space === spaceId),
    };
  }

  const spaceConfigWithImage: SpaceConfigEntity = entity
    ? {
        ...entity,
        spaceId: spaceId,
        image: Entities.avatar(entity.relationsOut) ?? Entities.cover(entity.relationsOut) ?? PLACEHOLDER_SPACE_IMAGE,
      }
    : {
        id: EntityId(''),
        spaceId: spaceId,
        name: null,
        description: null,
        image: PLACEHOLDER_SPACE_IMAGE,
        triples: [],
        types: [],
        nameTripleSpaces: [],
        spaces: [],
        relationsOut: [],
      };

  return spaceConfigWithImage;
}

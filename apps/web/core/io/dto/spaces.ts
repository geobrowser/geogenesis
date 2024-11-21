import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { SpaceGovernanceType } from '~/core/types';
import { Entities } from '~/core/utils/entity';

import { Address, EntityId, type Address as IAddress, SpaceId, SubstreamEntity, SubstreamSpace } from '../schema';
import { Entity, EntityDto } from './entities';

export type Space = {
  id: SpaceId;
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
  const spaceConfigEntity = SpaceMetadataDto(space.id, space.spacesMetadata.nodes[0]?.entity);

  return {
    id: space.id,
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

export function SpaceMetadataDto(spaceId: string, metadata: SubstreamEntity | undefined | null): SpaceConfigEntity {
  const entity = metadata ? EntityDto(metadata) : null;

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

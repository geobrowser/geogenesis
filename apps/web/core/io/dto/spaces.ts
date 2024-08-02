import { SpaceGovernanceType } from '~/core/types';

import { SpaceMetadataDto } from '../dto';
import { Address, type Address as IAddress, SpaceId, SubstreamEntity, SubstreamSpace } from '../schema';
import { Entity } from './entities';

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

export type SpaceMetadata = {
  id: string;
  name: string;
  metadata: {
    nodes: SubstreamEntity[];
  };
};

export type SpaceWithMetadata = {
  id: string;
  name: string | null;
  image: string;
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

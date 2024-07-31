import { SpaceConfigEntity, SpaceGovernanceType } from '~/core/types';

import { SpaceMetadataDto } from '../dto';
import { Address, type Address as IAddress, SpaceId, SubstreamSpace } from '../schema';

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

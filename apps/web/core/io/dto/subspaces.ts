import { Address, SpaceId, SubstreamSubspace } from '../schema';
import { SpaceConfigEntity, SpaceEntityDto } from './spaces';

export type Subspace = {
  id: SpaceId;
  daoAddress: Address;
  totalEditors: number;
  totalMembers: number;
  spaceConfig: SpaceConfigEntity;
};

export function SubspaceDto(subspace: SubstreamSubspace) {
  const spaceConfigWithImage = SpaceEntityDto(subspace.id, subspace.spacesMetadatum?.version);

  return {
    id: subspace.id,
    daoAddress: subspace.daoAddress,
    totalEditors: subspace.spaceEditors.totalCount,
    totalMembers: subspace.spaceMembers.totalCount,
    spaceConfig: spaceConfigWithImage,
  };
}

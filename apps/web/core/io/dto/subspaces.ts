import { SpaceConfigEntity } from '~/core/types';

import { SpaceMetadataDto } from '../dto';
import { Address, SpaceId, SubstreamSubspace } from '../schema';

export type Subspace = {
  id: SpaceId;
  daoAddress: Address;
  totalEditors: number;
  totalMembers: number;
  spaceConfig: SpaceConfigEntity;
};

export function SubspaceDto(space: SubstreamSubspace) {
  const spaceConfigWithImage = SpaceMetadataDto(space.subspace.id, space.subspace.spacesMetadata.nodes[0]?.entity);

  return {
    id: space.subspace.id,
    daoAddress: space.subspace.daoAddress,
    totalEditors: space.subspace.spaceEditors.totalCount,
    totalMembers: space.subspace.spaceMembers.totalCount,
    spaceConfig: spaceConfigWithImage,
  };
}

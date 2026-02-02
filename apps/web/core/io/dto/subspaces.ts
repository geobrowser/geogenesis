import { SpaceEntity } from '~/core/v2.types';

import { Address, SpaceId, SubstreamSubspace } from '../schema';
import { SpaceEntityDto } from './spaces';

export type Subspace = {
  id: SpaceId;
  address: Address;
  totalEditors: number;
  totalMembers: number;
  spaceConfig: SpaceEntity;
};

export function SubspaceDto(subspace: SubstreamSubspace) {
  // @TODO(migration): Map subspaces
  const spaceConfigWithImage = SpaceEntityDto(subspace.id, null);

  return {
    id: subspace.id,
    address: subspace.daoAddress,
    totalEditors: subspace.spaceEditors.totalCount,
    totalMembers: subspace.spaceMembers.totalCount,
    spaceConfig: spaceConfigWithImage,
  };
}

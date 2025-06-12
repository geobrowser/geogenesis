import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { SpaceGovernanceType } from '~/core/types';
import { Entities } from '~/core/utils/entity';
import { SpaceEntity } from '~/core/v2.types';

import { type Address, RemoteEntity, RemoteSpace } from '../v2/v2.schema';
import { EntityDtoLive } from './entities';

export type Space = {
  id: string;
  type: SpaceGovernanceType;
  entity: SpaceEntity;
  daoAddress: Address;
  spaceAddress: Address;
  mainVotingAddress: Address | null;
  membershipAddress: Address | null;
  personalAddress: Address | null;

  // editors: string[];
  // members: string[];
};

export function SpaceDto(space: RemoteSpace): Space {
  const spaceEntity = SpaceEntityDto(space.id, space.entity);

  return {
    id: space.id,
    type: space.type,
    entity: spaceEntity,

    daoAddress: space.daoAddress,
    mainVotingAddress: space.mainVotingAddress,
    membershipAddress: space.membershipAddress,
    personalAddress: space.personalAddress,
    spaceAddress: space.spaceAddress,
  };
}

export function SpaceEntityDto(spaceId: string, remoteEntity: RemoteEntity | null): SpaceEntity {
  const maybeEntity = remoteEntity ? EntityDtoLive(remoteEntity) : null;

  let entity = null;

  if (maybeEntity) {
    entity = {
      ...maybeEntity,
      // @TODO: Should be scoped to the space automatically by API
      values: maybeEntity.values.filter(triple => triple.spaceId === spaceId),
      relations: maybeEntity.relations.filter(relation => relation.spaceId === spaceId),
    };
  }

  const spaceConfigWithImage: SpaceEntity = entity
    ? {
        ...entity,
        spaceId: spaceId,
        image: Entities.avatar(entity.relations) ?? Entities.cover(entity.relations) ?? PLACEHOLDER_SPACE_IMAGE,
      }
    : {
        id: '',
        spaceId: spaceId,
        name: null,
        description: null,
        image: PLACEHOLDER_SPACE_IMAGE,
        values: [],
        types: [],
        spaces: [],
        relations: [],
      };

  return spaceConfigWithImage;
}

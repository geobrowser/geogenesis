import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { SpaceGovernanceType } from '~/core/types';
import { SpaceEntity } from '~/core/types';
import { Entities } from '~/core/utils/entity';

import { type Address, RemoteEntity, RemoteSpace } from '../schema';
import { EntityDtoLive } from './entities';

export type Space = {
  id: string;
  type: SpaceGovernanceType;
  entity: SpaceEntity;
  address: Address;

  // In v2, editors/members are identified by their memberSpaceId (hex format), not wallet address
  editors: string[];
  members: string[];
};

export function SpaceDto(space: RemoteSpace): Space {
  const spaceId = space.id;
  const spaceEntity = SpaceEntityDto(spaceId, space.page);

  return {
    id: spaceId,
    type: space.type,
    entity: spaceEntity,
    address: space.address,
    editors: space.editorsList.map(editor => editor.memberSpaceId),
    members: space.membersList.map(member => member.memberSpaceId),
  };
}

export function SpaceEntityDto(spaceId: string, remoteEntity: RemoteEntity | null): SpaceEntity {
  const maybeEntity = remoteEntity ? EntityDtoLive(remoteEntity) : null;

  let entity = null;

  if (maybeEntity) {
    entity = {
      ...maybeEntity,
      // Filter to space scope (API should do this automatically in future)
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

import { RelationDtoLive } from '~/core/io/dto/relations';
import { Entity } from '~/core/types';
import { sortSpaceIdsByRank } from '~/core/utils/space/space-ranking';

import { RemoteEntity } from '../schema';
import { ValueDto } from './values';

export function EntityDtoLive(remoteEntity: RemoteEntity): Entity {
  const relationsOut = remoteEntity.relationsList.map(r => RelationDtoLive(r));
  const values = remoteEntity.valuesList.map(v => ValueDto(remoteEntity, v));

  return {
    id: remoteEntity.id,
    name: remoteEntity.name,
    description: remoteEntity.description,
    spaces: sortSpaceIdsByRank([...remoteEntity.spaceIds]),
    types: [...remoteEntity.types],
    relations: relationsOut,
    values: values,
    updatedAt: remoteEntity.updatedAt,
  };
}

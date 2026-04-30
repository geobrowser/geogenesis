import { HIDDEN_PROPERTIES } from '~/core/constants';
import { RelationDtoLive } from '~/core/io/dto/relations';
import { Entity } from '~/core/types';
import { sortSpaceIdsByRank } from '~/core/utils/space/space-ranking';

import { RemoteEntity } from '../schema';
import { ValueDto } from './values';

export function EntityDtoLive(remoteEntity: RemoteEntity): Entity {
  const relationsOut = remoteEntity.relationsList.map(r => RelationDtoLive(r));
  const values = remoteEntity.valuesList.map(v => ValueDto(remoteEntity, v));

  // Drop spaces whose only contribution to this entity is a hidden property,
  // so navigation doesn't route to a space that has no real content.
  const spacesWithRealContent = new Set<string>();
  for (const v of remoteEntity.valuesList) {
    if (!HIDDEN_PROPERTIES.has(v.property.id)) spacesWithRealContent.add(v.spaceId);
  }
  for (const r of remoteEntity.relationsList) {
    spacesWithRealContent.add(r.spaceId);
  }
  const filteredSpaceIds = remoteEntity.spaceIds.filter(id => spacesWithRealContent.has(id));
  const spaceIdsForRouting = filteredSpaceIds.length > 0 ? filteredSpaceIds : [...remoteEntity.spaceIds];

  return {
    id: remoteEntity.id,
    name: remoteEntity.name,
    description: remoteEntity.description,
    spaces: sortSpaceIdsByRank(spaceIdsForRouting),
    types: [...remoteEntity.types],
    relations: relationsOut,
    values: values,
    createdAt: remoteEntity.createdAt,
    updatedAt: remoteEntity.updatedAt,
  };
}

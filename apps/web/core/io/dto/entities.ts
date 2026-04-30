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
  //
  let spaceIdsForRouting = [...remoteEntity.spaceIds];

  // Only use the unscoped allValuesList / allRelationsList projections when
  // the query provided both of them. The main valuesList/relationsList are
  // often scoped for display, so using them here can incorrectly narrow
  // routing to the currently queried subset of spaces.
  if (remoteEntity.allValuesList && remoteEntity.allRelationsList) {
    const spacesWithRealContent = new Set<string>();
    for (const v of remoteEntity.allValuesList) {
      if (v.property?.id && !HIDDEN_PROPERTIES.has(v.property.id)) spacesWithRealContent.add(v.spaceId);
    }
    for (const r of remoteEntity.allRelationsList) {
      spacesWithRealContent.add(r.spaceId);
    }
    const filteredSpaceIds = remoteEntity.spaceIds.filter(id => spacesWithRealContent.has(id));
    spaceIdsForRouting = filteredSpaceIds.length > 0 ? filteredSpaceIds : [...remoteEntity.spaceIds];
  }

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

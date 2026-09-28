import { RelationDtoLive, hasRelationTarget } from '~/core/io/dto/relations';
import { Entity } from '~/core/types';
import { name as nameFromValues, spacesFromRoutingProjections } from '~/core/utils/entity/entities';
import { sortSpaceIdsByRank } from '~/core/utils/space/space-ranking';

import { RemoteEntity } from '../schema';
import { ValueDto } from './values';

export function EntityDtoLive(remoteEntity: RemoteEntity): Entity {
  const relationsOut = remoteEntity.relationsList.filter(hasRelationTarget).map(r => RelationDtoLive(r));
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
    spaceIdsForRouting = spacesFromRoutingProjections({
      spaceIds: remoteEntity.spaceIds,
      values: remoteEntity.allValuesList,
      relations: remoteEntity.allRelationsList,
    });
  }

  // An entity can be named differently in every space that touches it, and the API's own `name`
  // picks one of them for us — for `Role` in the Root space that came back as `Person role`, the
  // name a downstream space gave it. `nameFromValues` applies the rule the rest of the app uses:
  // the highest-ranked space wins, with Root at the top. Where the query scoped values to a single
  // space that resolves to the same name it always did, and where it asked for no values at all
  // there is nothing to rank, so the API's answer still stands.
  const rankedName = nameFromValues(values);

  return {
    id: remoteEntity.id,
    name: rankedName ?? remoteEntity.name,
    description: remoteEntity.description,
    spaces: sortSpaceIdsByRank(spaceIdsForRouting),
    types: [...remoteEntity.types],
    relations: relationsOut,
    values: values,
    createdAt: remoteEntity.createdAt,
    updatedAt: remoteEntity.updatedAt,
    // Carried through because `relations` above is filtered: `hasRelationTarget` drops dangling
    // ones, so its length cannot tell a truncated page from a short one.
    relationsTotalCount: remoteEntity.relations?.totalCount,
  };
}

import { SystemIds } from '@graphprotocol/grc-20';

import { RelationDtoHistorical, RelationDtoLive } from '~/core/io/dto/relations';
import { TripleDto } from '~/core/io/dto/triples';
import { Entities } from '~/core/utils/entity';
import { Entity } from '~/core/v2.types';

import { EntityId, SubstreamEntityHistorical } from '../schema';
import { RemoteEntity } from '../v2/v2.schema';
import { ValueDto } from './values';

export function EntityDtoLive(substreamEntity: RemoteEntity): Entity {
  const relationsOut = substreamEntity.relations.map(r => RelationDtoLive(r, substreamEntity));

  return {
    id: substreamEntity.id,
    name: substreamEntity.name,
    description: substreamEntity.description,
    spaces: [],
    types: [...substreamEntity.types],
    relations: relationsOut,
    values: substreamEntity.values.map(ValueDto),
  };
}

export function EntityDtoHistorical(substreamEntity: SubstreamEntityHistorical) {
  const entity = substreamEntity.currentVersion.version;
  const networkTriples = entity.triples.nodes;
  const triples = networkTriples.map(TripleDto);
  const nameTriples = Entities.nameTriples(triples);

  const networkRelations = entity.relationsByFromVersionId.nodes;
  const relationsOut = networkRelations.map(RelationDtoHistorical);

  const entityTypes = relationsOut
    .filter(relation => relation.typeOf.id === EntityId(SystemIds.TYPES_ATTRIBUTE))
    .map(relation => {
      return {
        id: relation.toEntity.id,
        name: relation.toEntity.name,
      };
    });

  return {
    id: substreamEntity.id,
    name: entity.name,
    description: Entities.description(triples),
    nameTripleSpaces: nameTriples.map(t => t.space),
    spaces: entity.versionSpaces.nodes.map(node => node.spaceId),
    types: entityTypes,
    relationsOut,
    triples,
  };
}

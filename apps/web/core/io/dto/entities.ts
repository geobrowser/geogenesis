import { SystemIds } from '@graphprotocol/grc-20';

import { RelationDtoHistorical, RelationDtoLive } from '~/core/io/dto/relations';
import { TripleDto } from '~/core/io/dto/triples';
import { Entities } from '~/core/utils/entity';
import { Entity } from '~/core/v2.types';

import { EntityId, SubstreamEntityHistorical } from '../schema';
import { RemoteEntity } from '../v2/v2.schema';
import { ValueDto } from './values';

export function EntityDtoLive(remoteEntity: RemoteEntity): Entity {
  const relationsOut = remoteEntity.relations.map(r => RelationDtoLive(r, remoteEntity));

  return {
    id: remoteEntity.id,
    name: remoteEntity.name,
    description: remoteEntity.description,
    spaces: [],
    types: [...remoteEntity.types],
    relations: relationsOut,
    values: remoteEntity.values.map(v => ValueDto(remoteEntity, v)),
  };
}

export function EntityDtoHistorical(substreamEntity: SubstreamEntityHistorical) {
  const entity = substreamEntity.currentVersion.version;
  const networkTriples = entity.triples.nodes;
  const triples = networkTriples.map(TripleDto);

  const networkRelations = entity.relationsByFromVersionId.nodes;
  const relationsOut = networkRelations.map(RelationDtoHistorical);

  const entityTypes = relationsOut
    .filter(relation => relation.typeOf.id === EntityId(SystemIds.TYPES_PROPERTY))
    .map(relation => {
      return {
        id: relation.toEntity.id,
        name: relation.toEntity.name,
      };
    });

  return {
    id: substreamEntity.id,
    name: entity.name,
    // @TODO: This Dto is using the legacy data model still, so we can't
    // correctly read description this way
    description: Entities.description([]),
    nameTripleSpaces: [],
    spaces: entity.versionSpaces.nodes.map(node => node.spaceId),
    types: entityTypes,
    relationsOut,
    triples,
  };
}

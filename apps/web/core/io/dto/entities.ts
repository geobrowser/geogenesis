import { SYSTEM_IDS } from '@geogenesis/sdk';

import { RelationDtoHistorical, RelationDtoLive } from '~/core/io/dto/relations';
import { TripleDto } from '~/core/io/dto/triples';
import { Relation, Triple } from '~/core/types';
import { Entities } from '~/core/utils/entity';

import { EntityId, SubstreamEntityHistorical, SubstreamEntityLive } from '../schema';

export type Entity = {
  id: EntityId;
  name: string | null;
  description: string | null;
  nameTripleSpaces: string[];
  spaces: string[];
  types: { id: EntityId; name: string | null }[];
  relationsOut: Relation[];
  triples: Triple[];
};

export function EntityDtoLive(substreamEntity: SubstreamEntityLive): Entity {
  const entity = substreamEntity.currentVersion.version;
  const networkTriples = entity.triples.nodes;
  const triples = networkTriples.map(TripleDto);
  const nameTriples = Entities.nameTriples(triples);

  const networkRelations = entity.relationsByFromVersionId.nodes;
  const relationsOut = networkRelations.map(RelationDtoLive);

  const entityTypes = relationsOut
    .filter(relation => relation.typeOf.id === SYSTEM_IDS.TYPES_ATTRIBUTE)
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

export function EntityDtoHistorical(substreamEntity: SubstreamEntityHistorical) {
  const entity = substreamEntity.currentVersion.version;
  const networkTriples = entity.triples.nodes;
  const triples = networkTriples.map(TripleDto);
  const nameTriples = Entities.nameTriples(triples);

  const networkRelations = entity.relationsByFromVersionId.nodes;
  const relationsOut = networkRelations.map(RelationDtoHistorical);

  const entityTypes = relationsOut
    .filter(relation => relation.typeOf.id === SYSTEM_IDS.TYPES_ATTRIBUTE)
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

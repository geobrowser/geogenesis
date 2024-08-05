import { EntityId, Triple } from '~/core/types';
import { Entities } from '~/core/utils/entity';

import { TripleDto } from '../dto';
import { SubstreamEntity, SubstreamType } from '../schema';

export type Entity = {
  id: EntityId;
  name: string | null;
  description: string | null;
  nameTripleSpaces: string[];
  types: SubstreamType[];
  relationsOut: Relation[];
  triples: Triple[];
};

export type Relation = {
  index: string;
  typeOf: {
    id: EntityId;
    name: string | null;
  };
  fromEntity: {
    id: EntityId;
    name: string | null;
  };
  toEntity: {
    id: EntityId;
    name: string | null;
    types: {
      id: EntityId;
      name: string | null;
    }[];
  };
};

export function EntityDto(entity: SubstreamEntity): Entity {
  const networkTriples = entity.triples.nodes;
  const triples = networkTriples.map(TripleDto);
  const nameTriples = Entities.nameTriples(triples);

  return {
    id: entity.id,
    name: entity.name,
    description: Entities.description(triples),
    nameTripleSpaces: nameTriples.map(t => t.space),
    types: entity.entityTypes.nodes.map(t => t.type),
    relationsOut: entity.relationsByFromEntityId.nodes.map(t => {
      return {
        ...t,
        toEntity: {
          id: t.toEntity.id,
          name: t.toEntity.name,
          types: t.toEntity.entityTypes.nodes.map(t => t.type),
          triples: t.toEntity.triples.nodes.map(TripleDto),
        },
      };
    }),
    triples,
  };
}

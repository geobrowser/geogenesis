import { RelationDto } from '~/core/io/dto/relations';
import { TripleDto } from '~/core/io/dto/triples';
import { Relation, Triple } from '~/core/types';
import { Entities } from '~/core/utils/entity';

import { EntityId, SubstreamEntity } from '../schema';

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

export function EntityDto(substreamEntity: SubstreamEntity): Entity {
  const entity = substreamEntity.currentVersion.version;
  const networkTriples = entity.triples.nodes;
  const triples = networkTriples.map(TripleDto);
  const nameTriples = Entities.nameTriples(triples);
  const entityTypes = entity.versionTypes.nodes.map(t => {
    return {
      id: t.type.entityId,
      name: t.type.name,
    };
  });

  const networkRelations = entity.relationsByFromVersionId.nodes;
  const relationsOut = networkRelations.map(RelationDto);

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

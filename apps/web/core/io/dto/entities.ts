import { SYSTEM_IDS } from '@geogenesis/sdk';

import { RenderableEntityType, Triple } from '~/core/types';
import { Entities } from '~/core/utils/entity';

import { TripleDto } from '../dto';
import { EntityId, SubstreamEntity, SubstreamType, TypeId } from '../schema';

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
  id: EntityId;
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
    types: SubstreamType[];

    // The "Renderable Type" for an entity provides a hint to the consumer
    // of the entity to _what_ the entity is so they know how they should
    // render it depending on their use case.
    renderableType: RenderableEntityType;

    // The value of the To entity depends on the type of the To entity. e.g.,
    // if the entity is an image, the value is the URL of the image.
    value: string | null;
  };
};

export function EntityDto(entity: SubstreamEntity): Entity {
  const networkTriples = entity.triples.nodes;
  const triples = networkTriples.map(TripleDto);
  const nameTriples = Entities.nameTriples(triples);
  const entityTypes = entity.entityTypes.nodes.map(t => t.type);

  return {
    id: entity.id,
    name: entity.name,
    description: Entities.description(triples),
    nameTripleSpaces: nameTriples.map(t => t.space),
    types: entityTypes,
    relationsOut: entity.relationsByFromEntityId.nodes.map(t => {
      const toEntityTriples = t.toEntity.triples.nodes.map(TripleDto);
      const toEntityTypes = t.toEntity.entityTypes.nodes.map(t => t.type);

      // If the entity is an image then we should already have the triples used to define
      // the image URI for that image. We need to parse the triples to find the correct
      // triple URI value representing the image URI.
      const imageEntityUrlValue =
        toEntityTriples.find(t => t.attributeId === SYSTEM_IDS.IMAGE_URL_ATTRIBUTE)?.value.value ?? null;

      return {
        ...t,
        toEntity: {
          id: t.toEntity.id,
          name: t.toEntity.name,
          types: toEntityTypes,
          triples: toEntityTriples,

          // The "Renderable Type" for an entity provides a hint to the consumer
          // of the entity to _what_ the entity is so they know how they should
          // render it depending on their use case.
          renderableType: getRenderableEntityType(toEntityTypes),
          // Right now we only support images as the value of the To entity.
          value: imageEntityUrlValue ?? null,
        },
      };
    }),
    triples,
  };
}

function getRenderableEntityType(types: SubstreamType[]): RenderableEntityType {
  if (types.map(t => t.id).includes(TypeId(SYSTEM_IDS.IMAGE))) {
    return 'IMAGE';
  }

  return 'DEFAULT';
}

import { SYSTEM_IDS } from '@geobrowser/gdk';

import { RenderableEntityType, Triple } from '~/core/types';
import { Entities } from '~/core/utils/entity';

import { EntityId, SubstreamEntity, SubstreamType, TypeId } from '../schema';
import { TripleDto } from './triples';

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

    // The "Renderable Type" for an entity provides a hint to the consumer
    // of the entity to _what_ the entity is so they know how they should
    // render it depending on their use case.
    renderableType: RenderableEntityType;

    // The value of the To entity depends on the type of the To entity. e.g.,
    // if the entity is an image, the value is the URL of the image. If it's
    // a regular entity, the valu is the ID. It's a bit duplicative, but will
    // make more sense when we add support for other entity types.
    value: string;
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

      const renderableType = getRenderableEntityType(toEntityTypes);

      // @TODO(relations): Until we fix the migrations we'll manually check for cover and avatar
      // relations and set the renderable typ to image.
      const isCoverOrAvatar =
        t.typeOf.id === EntityId(SYSTEM_IDS.COVER_ATTRIBUTE) || t.typeOf.id === EntityId(SYSTEM_IDS.AVATAR_ATTRIBUTE);

      return {
        ...t,
        toEntity: {
          id: t.toEntity.id,
          name: t.toEntity.name,

          // The "Renderable Type" for an entity provides a hint to the consumer
          // of the entity to _what_ the entity is so they know how they should
          // render it depending on their use case.
          renderableType: isCoverOrAvatar ? 'IMAGE' : renderableType,
          // Right now we only support images and entity ids as the value of the To entity.
          value: isCoverOrAvatar || renderableType === 'IMAGE' ? imageEntityUrlValue ?? '' : t.toEntity.id,
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

  if (types.map(t => t.id).includes(TypeId(SYSTEM_IDS.TABLE_BLOCK))) {
    return 'DATA';
  }

  if (types.map(t => t.id).includes(TypeId(SYSTEM_IDS.TEXT_BLOCK))) {
    return 'TEXT';
  }

  return 'RELATION';
}

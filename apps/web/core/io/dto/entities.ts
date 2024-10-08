import { SYSTEM_IDS } from '@geogenesis/sdk';

import { RenderableEntityType, Triple } from '~/core/types';
import { Entities } from '~/core/utils/entity';

import { EntityId, SubstreamEntity, SubstreamType } from '../schema';
import { TripleDto } from './triples';

export type Entity = {
  id: EntityId;
  name: string | null;
  description: string | null;
  nameTripleSpaces: string[];
  types: { id: EntityId; name: string | null }[];
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

  return {
    id: substreamEntity.id,
    name: entity.name,
    description: Entities.description(triples),
    nameTripleSpaces: nameTriples.map(t => t.space),
    types: entityTypes,
    relationsOut: entity.relationsByFromVersionId.nodes.map(t => {
      const toEntityTriples = t.toVersion.triples.nodes.map(TripleDto);
      const toEntityTypes = t.toVersion.versionTypes.nodes.map(t => t.type);

      // If the entity is an image then we should already have the triples used to define
      // the image URI for that image. We need to parse the triples to find the correct
      // triple URI value representing the image URI.
      const imageEntityUrlValue =
        toEntityTriples.find(t => t.attributeId === SYSTEM_IDS.IMAGE_URL_ATTRIBUTE)?.value.value ?? null;

      const renderableType = getRenderableEntityType(toEntityTypes);

      // @TODO(relations): Until we fix the migrations we'll manually check for cover and avatar
      // relations and set the renderable typ to image.
      const isCoverOrAvatar =
        t.typeOf.entityId === EntityId(SYSTEM_IDS.COVER_ATTRIBUTE) ||
        t.typeOf.entityId === EntityId(SYSTEM_IDS.AVATAR_ATTRIBUTE);

      return {
        id: t.id,
        index: t.index,
        typeOf: {
          id: t.typeOf.entityId,
          name: t.typeOf.name,
        },
        fromEntity: {
          id: t.fromVersion.entityId,
          name: t.fromVersion.name,
        },
        toEntity: {
          id: t.toVersion.entityId,
          name: t.toVersion.name,

          // The "Renderable Type" for an entity provides a hint to the consumer
          // of the entity to _what_ the entity is so they know how they should
          // render it depending on their use case.
          renderableType: isCoverOrAvatar ? 'IMAGE' : renderableType,
          // Right now we only support images and entity ids as the value of the To entity.
          value: isCoverOrAvatar || renderableType === 'IMAGE' ? imageEntityUrlValue ?? '' : t.toVersion.entityId,
        },
      };
    }),
    triples,
  };
}

function getRenderableEntityType(types: SubstreamType[]): RenderableEntityType {
  const typeIds = types.map(t => t.entityId);

  if (typeIds.includes(EntityId(SYSTEM_IDS.IMAGE))) {
    return 'IMAGE';
  }

  if (typeIds.includes(EntityId(SYSTEM_IDS.TABLE_BLOCK))) {
    return 'DATA';
  }

  if (typeIds.includes(EntityId(SYSTEM_IDS.TEXT_BLOCK))) {
    return 'TEXT';
  }

  return 'RELATION';
}

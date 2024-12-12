import { SYSTEM_IDS } from '@geogenesis/sdk';

import { TripleDto } from '~/core/io/dto/triples';
import { RenderableEntityType } from '~/core/types';

import { EntityId, SubstreamRelation, SubstreamType } from '../schema';

export function RelationDto(relation: SubstreamRelation) {
  const toEntityTriples = relation.toVersion.triples.nodes.map(TripleDto);
  const toEntityTypes = relation.toVersion.versionTypes.nodes.map(relation => relation.type);

  // If the entity is an image then we should already have the triples used to define
  // the image URI for that image. We need to parse the triples to find the correct
  // triple URI value representing the image URI.
  const imageEntityUrlValue =
    toEntityTriples.find(relation => relation.attributeId === SYSTEM_IDS.IMAGE_URL_ATTRIBUTE)?.value.value ?? null;

  const renderableType = getRenderableEntityType(toEntityTypes);

  return {
    space: relation.spaceId,
    id: relation.entityId,
    index: relation.index,
    typeOf: {
      id: relation.typeOf.entityId,
      name: relation.typeOf.name,
    },
    fromEntity: {
      id: relation.fromVersion.entityId,
      name: relation.fromVersion.name,
    },
    toEntity: {
      id: relation.toVersion.entityId,
      name: relation.toVersion.name,

      // The "Renderable Type" for an entity provides a hint to the consumer
      // of the entity to _what_ the entity is so they know how they should
      // render it depending on their use case.
      renderableType,
      // Right now we only support images and entity ids as the value of the To entity.
      value: renderableType === 'IMAGE' ? imageEntityUrlValue ?? '' : relation.toVersion.entityId,
    },
  };
}

function getRenderableEntityType(types: SubstreamType[]): RenderableEntityType {
  const typeIds = types.map(relation => relation.entityId);

  if (typeIds.includes(EntityId(SYSTEM_IDS.IMAGE_TYPE))) {
    return 'IMAGE';
  }

  if (typeIds.includes(EntityId(SYSTEM_IDS.DATA_BLOCK))) {
    return 'DATA';
  }

  if (typeIds.includes(EntityId(SYSTEM_IDS.TEXT_BLOCK))) {
    return 'TEXT';
  }

  return 'RELATION';
}

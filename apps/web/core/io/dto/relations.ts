import { SystemIds } from '@geoprotocol/geo-sdk';

import { VIDEO_BLOCK_TYPE, VIDEO_TYPE, VIDEO_URL_PROPERTY } from '~/core/constants';
import { RemoteEntityType, RemoteRelation } from '~/core/io/schema';
import { Relation, RenderableEntityType } from '~/core/types';

export function RelationDtoLive(relation: RemoteRelation): Relation {
  const imageUrlPropertyHex = SystemIds.IMAGE_URL_PROPERTY.replace(/-/g, '');
  const mediaEntityUrlValue =
    relation.toEntity.valuesList.find(v => v.propertyId === imageUrlPropertyHex)?.text ??
    relation.toEntity.valuesList.find(v => v.propertyId === VIDEO_URL_PROPERTY)?.text ??
    null;
  const renderableType = v2_getRenderableEntityType(relation.toEntity.types);

  const toEntityId = relation.toEntity.id;

  return {
    id: relation.id,
    spaceId: relation.spaceId,
    entityId: relation.entityId,
    position: relation.position ?? undefined,
    verified: relation.verified ?? undefined,
    // toSpaceId: relation.toSpaceId ?? undefined,
    toSpaceId: undefined,
    renderableType,
    type: {
      id: relation.type.id,
      name: relation.type.name ?? null,
    },
    fromEntity: {
      id: relation.fromEntity.id,
      name: relation.fromEntity.name,
    },
    toEntity: {
      id: toEntityId,
      name: relation.toEntity.name,

      // The "Renderable Type" for an entity provides a hint to the consumer
      // of the entity to _what_ the entity is so they know how they should
      // render it depending on their use case.
      // Right now we support images, videos, and entity ids as the value of the To entity.
      value: renderableType === 'IMAGE' || renderableType === 'VIDEO' ? (mediaEntityUrlValue ?? '') : toEntityId,
    },
  };
}

function v2_getRenderableEntityType(types: readonly RemoteEntityType[]): RenderableEntityType {
  const typeIds = types.map(type => type.id);

  const imageTypeHex = SystemIds.IMAGE_TYPE.replace(/-/g, '');
  const dataBlockHex = SystemIds.DATA_BLOCK.replace(/-/g, '');
  const textBlockHex = SystemIds.TEXT_BLOCK.replace(/-/g, '');

  if (typeIds.includes(imageTypeHex)) {
    return 'IMAGE';
  }

  if (typeIds.includes(VIDEO_TYPE) || typeIds.includes(VIDEO_BLOCK_TYPE)) {
    return 'VIDEO';
  }

  if (typeIds.includes(dataBlockHex)) {
    return 'DATA';
  }

  if (typeIds.includes(textBlockHex)) {
    return 'TEXT';
  }

  return 'RELATION';
}

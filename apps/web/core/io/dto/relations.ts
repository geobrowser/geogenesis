import { SystemIds } from '@graphprotocol/grc-20';

import { RemoteEntityType, RemoteRelation } from '~/core/io/v2/v2.schema';
import { Relation, RenderableEntityType } from '~/core/v2.types';

import { EntityId, SubstreamRelationHistorical, SubstreamType } from '../schema';

export function RelationDtoLive(relation: RemoteRelation): Relation {
  const imageEntityUrlValue =
    relation.toEntity.valuesList.find(relation => relation.propertyId === SystemIds.IMAGE_URL_PROPERTY)?.string ?? null;
  const renderableType = v2_getRenderableEntityType(relation.toEntity.types);

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
      id: relation.toEntity.id,
      name: relation.toEntity.name,

      // The "Renderable Type" for an entity provides a hint to the consumer
      // of the entity to _what_ the entity is so they know how they should
      // render it depending on their use case.
      // Right now we only support images and entity ids as the value of the To entity.
      value: renderableType === 'IMAGE' ? (imageEntityUrlValue ?? '') : relation.toEntity.id,
    },
  };
}

export function RelationDtoHistorical(relation: SubstreamRelationHistorical) {
  const toEntityTypes = relation.toVersion.versionTypes.nodes.map(relation => relation.type);

  // If the entity is an image then we should already have the triples used to define
  // the image URI for that image. We need to parse the triples to find the correct
  // triple URI value representing the image URI.
  // const imageEntityUrlValue =
  // toEntityTriples.find(relation => relation.attributeId === SystemIds.IMAGE_URL_PROPERTY)?.value.value ?? null;
  const imageEntityUrlValue = undefined;

  const renderableType = getRenderableEntityType(toEntityTypes);

  return {
    space: relation.spaceId,
    id: relation.entityId,
    index: 'a0',
    typeOf: {
      id: relation.typeOfVersion.entityId,
      name: relation.typeOfVersion.name,
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
      value: renderableType === 'IMAGE' ? (imageEntityUrlValue ?? '') : relation.toVersion.entityId,
    },
  };
}

function v2_getRenderableEntityType(types: readonly RemoteEntityType[]): RenderableEntityType {
  const typeIds = types.map(type => type.id);

  if (typeIds.includes(EntityId(SystemIds.IMAGE_TYPE))) {
    return 'IMAGE';
  }

  if (typeIds.includes(EntityId(SystemIds.DATA_BLOCK))) {
    return 'DATA';
  }

  if (typeIds.includes(EntityId(SystemIds.TEXT_BLOCK))) {
    return 'TEXT';
  }

  return 'RELATION';
}

function getRenderableEntityType(types: SubstreamType[]): RenderableEntityType {
  const typeIds = types.map(relation => relation.entityId);

  if (typeIds.includes(EntityId(SystemIds.IMAGE_TYPE))) {
    return 'IMAGE';
  }

  if (typeIds.includes(EntityId(SystemIds.DATA_BLOCK))) {
    return 'DATA';
  }

  if (typeIds.includes(EntityId(SystemIds.TEXT_BLOCK))) {
    return 'TEXT';
  }

  return 'RELATION';
}

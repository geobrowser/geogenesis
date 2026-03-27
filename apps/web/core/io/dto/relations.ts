import { SystemIds } from '@geoprotocol/geo-sdk';

import { RemoteEntityType, RemoteRelation } from '~/core/io/schema';
import { Relation, RenderableEntityType } from '~/core/types';
import { getSpaceRank } from '~/core/utils/space/space-ranking';

export function RelationDtoLive(relation: RemoteRelation): Relation {
  const ipfsUrlPropertyHex = SystemIds.IMAGE_URL_PROPERTY.replace(/-/g, '');
  const mediaEntityUrlValue = relation.toEntity.valuesList.find(v => v.propertyId === ipfsUrlPropertyHex)?.text ?? null;
  const baseRenderableType = v2_getRenderableEntityType(relation.toEntity.types);

  const renderableType = mediaEntityUrlValue && baseRenderableType === 'RELATION' ? 'IMAGE' : baseRenderableType;

  const toEntityId = relation.toEntity.id;
  const toEntityName = resolveToEntityName(relation);

  return {
    id: relation.id,
    spaceId: relation.spaceId,
    entityId: relation.entityId,
    position: relation.position ?? undefined,
    verified: relation.verified ?? undefined,
    toSpaceId: relation.toSpaceId ?? undefined,
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
      name: toEntityName,
      value: renderableType === 'IMAGE' || renderableType === 'VIDEO' ? (mediaEntityUrlValue ?? '') : toEntityId,
    },
  };
}

/**
 * Resolve the toEntity name from the highest-ranked space. The API's top-level
 * name field is not space-scoped, so we derive the name from valuesList instead.
 */
function resolveToEntityName(relation: RemoteRelation): string | null {
  const namePropertyHex = SystemIds.NAME_PROPERTY.replace(/-/g, '');
  const nameValues = relation.toEntity.valuesList.filter(v => v.propertyId === namePropertyHex && v.text);

  if (nameValues.length === 0) return relation.toEntity.name;
  if (nameValues.length === 1) return nameValues[0].text;

  return nameValues.reduce((a, b) => (getSpaceRank(a.spaceId) <= getSpaceRank(b.spaceId) ? a : b)).text;
}

function v2_getRenderableEntityType(types: readonly RemoteEntityType[]): RenderableEntityType {
  const typeIds = types.map(type => type.id);

  const imageTypeHex = SystemIds.IMAGE_TYPE.replace(/-/g, '');
  const videoTypeHex = SystemIds.VIDEO_TYPE.replace(/-/g, '');
  const videoBlockHex = SystemIds.VIDEO_BLOCK.replace(/-/g, '');
  const dataBlockHex = SystemIds.DATA_BLOCK.replace(/-/g, '');
  const textBlockHex = SystemIds.TEXT_BLOCK.replace(/-/g, '');

  if (typeIds.includes(imageTypeHex)) {
    return 'IMAGE';
  }

  // Match both VIDEO_TYPE (new) and VIDEO_BLOCK (legacy) for backwards compatibility
  if (typeIds.includes(videoTypeHex) || typeIds.includes(videoBlockHex)) {
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

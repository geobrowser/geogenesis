import { Position, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { parsePositivePixelDimension } from '~/core/blocks/data/resolve-main-media-property';
import { PROPERTY_HEIGHT_PIXELS_ID, PROPERTY_WIDTH_PIXELS_ID, RENDERABLE_TYPE_PROPERTY } from '~/core/constants';
import { type BlockMediaDimensions, NO_BLOCK_MEDIA_DIMENSIONS } from '~/core/hooks/use-block-media-dimensions';
import { ID } from '~/core/id';
import { getStrictRenderableType } from '~/core/io/dto/properties';
import type { Entity } from '~/core/types';

import { columnPropertyIdFromRelation, isShownColumnRelation } from './shown-column-relations';

/**
 * The property ids a block shows, in the order `useView` puts them in.
 *
 * Deliberately built with the same helpers the client uses. A shown-column relation's property id
 * is `toEntity.value` when set and `toEntity.id` otherwise, and the columns are ordered by
 * position rather than by however the API returned the relations — reconstructing either of those
 * by hand here is how the server and client end up disagreeing about which column holds the media.
 */
export function shownColumnIdsForBlock(blockRelationEntity: Entity): string[] {
  return blockRelationEntity.relations
    .filter(isShownColumnRelation)
    .slice()
    .sort((a, b) => Position.compare(a.position ?? null, b.position ?? null))
    .map(columnPropertyIdFromRelation)
    .filter(Boolean);
}

/**
 * A block's configured media dimensions, read straight off entities the server already fetched.
 *
 * `useBlockMainMedia` resolves the media column through the property schema, which is a client
 * request — no good for the pre-hydration render, which is exactly where sizing the frame wrong
 * costs a reflow. This reads the same thing out of the property entities instead: the renderable
 * type is a relation on the property, so "first shown Image or Video column" is answerable here
 * without the schema, and answering it the same way is the whole point.
 */
export function readBlockMediaDimensions(
  blockRelationEntityId: string,
  entities: readonly Entity[]
): BlockMediaDimensions {
  const blockRelationEntity = entities.find(entity => entity.id === blockRelationEntityId);
  if (!blockRelationEntity) return NO_BLOCK_MEDIA_DIMENSIONS;

  for (const propertyId of shownColumnIdsForBlock(blockRelationEntity)) {
    // `resolveMainMediaProperty` skips Name before anything else; it's implicit in every block.
    if (ID.equals(propertyId, SystemIds.NAME_PROPERTY)) continue;

    const property = entities.find(entity => ID.equals(entity.id, propertyId));
    if (!property || !isMediaProperty(property)) continue;

    return readDimensions(property);
  }

  return NO_BLOCK_MEDIA_DIMENSIONS;
}

function isMediaProperty(property: Entity): boolean {
  const renderableTypeId = property.relations.find(
    relation => !relation.isDeleted && ID.equals(relation.type.id, RENDERABLE_TYPE_PROPERTY)
  )?.toEntity.id;

  const renderableType = getStrictRenderableType(renderableTypeId ?? null);
  return renderableType === 'IMAGE' || renderableType === 'VIDEO';
}

function readDimensions(property: Entity): BlockMediaDimensions {
  let width: number | null = null;
  let height: number | null = null;

  // No space filter: a property is defined in whatever space owns it, which is rarely the space
  // of the page rendering the block. `useBlockMediaDimensions` reads them the same way.
  for (const value of property.values ?? []) {
    if (value.isDeleted) continue;

    if (ID.equals(value.property.id, PROPERTY_WIDTH_PIXELS_ID)) {
      width = parsePositivePixelDimension(value.value) ?? width;
    } else if (ID.equals(value.property.id, PROPERTY_HEIGHT_PIXELS_ID)) {
      height = parsePositivePixelDimension(value.value) ?? height;
    }
  }

  return {
    width,
    height,
    aspectRatio: width != null && height != null ? `${width} / ${height}` : null,
  };
}

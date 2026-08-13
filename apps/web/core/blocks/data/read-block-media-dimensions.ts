import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { parsePositivePixelDimension } from '~/core/blocks/data/resolve-main-media-property';
import { PROPERTY_HEIGHT_PIXELS_ID, PROPERTY_WIDTH_PIXELS_ID } from '~/core/constants';
import { type BlockMediaDimensions, NO_BLOCK_MEDIA_DIMENSIONS } from '~/core/hooks/use-block-media-dimensions';
import { ID } from '~/core/id';
import type { Entity, Relation } from '~/core/types';

/**
 * A block's configured media dimensions, read straight off entities the server already fetched.
 *
 * The hook version resolves the media column through the property schema, which is a client
 * request — no good for the pre-hydration render, which is exactly where sizing the frame wrong
 * costs a reflow. Here we take the first shown column carrying Width/Height instead. Nothing but
 * an Image or Video property carries them, and where none does the answer is the view default,
 * which is what an unmatched lookup returns anyway.
 */
export function readBlockMediaDimensions(
  blockRelationEntityId: string,
  entities: readonly Entity[]
): BlockMediaDimensions {
  const blockRelationEntity = entities.find(entity => entity.id === blockRelationEntityId);
  if (!blockRelationEntity) return NO_BLOCK_MEDIA_DIMENSIONS;

  const shownColumnIds = (blockRelationEntity.relations ?? [])
    .filter(isShownColumnRelation)
    .map(relation => relation.toEntity.id)
    .filter(Boolean);

  for (const propertyId of shownColumnIds) {
    const property = entities.find(entity => ID.equals(entity.id, propertyId));
    if (!property) continue;

    let width: number | null = null;
    let height: number | null = null;

    // No space filter: a property is defined in whatever space owns it, which is rarely the
    // space of the page rendering the block. `useBlockMediaDimensions` reads them the same way.
    for (const value of property.values ?? []) {
      if (value.isDeleted) continue;

      if (ID.equals(value.property.id, PROPERTY_WIDTH_PIXELS_ID)) {
        width = parsePositivePixelDimension(value.value) ?? width;
      } else if (ID.equals(value.property.id, PROPERTY_HEIGHT_PIXELS_ID)) {
        height = parsePositivePixelDimension(value.value) ?? height;
      }
    }

    if (width == null && height == null) continue;

    return {
      width,
      height,
      aspectRatio: width != null && height != null ? `${width} / ${height}` : null,
    };
  }

  return NO_BLOCK_MEDIA_DIMENSIONS;
}

function isShownColumnRelation(relation: Relation): boolean {
  if (relation.isDeleted) return false;
  return relation.type.id === SystemIds.PROPERTIES || relation.type.id === SystemIds.SHOWN_COLUMNS;
}

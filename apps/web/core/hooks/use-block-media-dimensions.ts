'use client';

import * as React from 'react';

import { parsePositivePixelDimension } from '~/core/blocks/data/resolve-main-media-property';
import { PROPERTY_HEIGHT_PIXELS_ID, PROPERTY_WIDTH_PIXELS_ID } from '~/core/constants';
import { ID } from '~/core/id';
import { useValues } from '~/core/sync/use-store';

export type BlockMediaDimensions = {
  width: number | null;
  height: number | null;
  /** CSS aspect-ratio when both width and height are set; otherwise null (use view defaults). */
  aspectRatio: string | null;
};

/**
 * Reads Width (pixels) / Height (pixels) from an Image or Video property entity.
 */
export function useBlockMediaDimensions(propertyId: string | null | undefined): BlockMediaDimensions {
  const dimensionValues = useValues({
    selector: v =>
      Boolean(propertyId) &&
      ID.equals(v.entity.id, propertyId as string) &&
      (ID.equals(v.property.id, PROPERTY_WIDTH_PIXELS_ID) || ID.equals(v.property.id, PROPERTY_HEIGHT_PIXELS_ID)),
  });

  return React.useMemo(() => {
    let width: number | null = null;
    let height: number | null = null;

    for (const value of dimensionValues) {
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
  }, [dimensionValues]);
}

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

export const NO_BLOCK_MEDIA_DIMENSIONS: BlockMediaDimensions = { width: null, height: null, aspectRatio: null };

export type BlockMediaDimensionsResult = {
  dimensions: BlockMediaDimensions;
  /**
   * Whether the property entity is in the store at all. Without this, `dimensions` being empty
   * is ambiguous — "this property configures no size" and "we haven't fetched it yet" look
   * identical, and a gallery that can't tell them apart either stalls on a fetch it doesn't
   * need or paints a ratio it's about to change.
   */
  isHydrated: boolean;
};

/**
 * Reads Width (pixels) / Height (pixels) from an already-hydrated Image or Video property entity.
 *
 * Hydration is the caller's job — the server sends these down with the page's blocks, and
 * `useBlockMainMedia` fetches any that are missing. Fetching here instead would chain behind the
 * property schema resolving which column is the media one, and the gallery would paint at the
 * default ratio before the real one arrived.
 */
export function useBlockMediaDimensions(propertyId: string | null | undefined): BlockMediaDimensionsResult {
  // Every value on the property, not just the two dimensions: a property that configures no size
  // still has a name, and that's what separates "hydrated, no dimensions" from "not fetched".
  const propertyValues = useValues({
    selector: v => Boolean(propertyId) && ID.equals(v.entity.id, propertyId as string),
  });

  return React.useMemo(() => {
    let width: number | null = null;
    let height: number | null = null;

    for (const value of propertyValues) {
      if (ID.equals(value.property.id, PROPERTY_WIDTH_PIXELS_ID)) {
        width = parsePositivePixelDimension(value.value) ?? width;
      } else if (ID.equals(value.property.id, PROPERTY_HEIGHT_PIXELS_ID)) {
        height = parsePositivePixelDimension(value.value) ?? height;
      }
    }

    return {
      dimensions: {
        width,
        height,
        aspectRatio: width != null && height != null ? `${width} / ${height}` : null,
      },
      isHydrated: propertyValues.length > 0,
    };
  }, [propertyValues]);
}

export type BlockMediaFrame = {
  style: React.CSSProperties | undefined;
  hasCustomHeight: boolean;
};

/**
 * Inline sizing for a media frame from the property's configured dimensions.
 */
export function blockMediaFrame(dimensions: BlockMediaDimensions, options?: { allowWidth?: boolean }): BlockMediaFrame {
  const { width, height, aspectRatio } = dimensions;
  const style: React.CSSProperties = {};

  if (options?.allowWidth && width != null) style.width = width;

  if (aspectRatio) {
    style.aspectRatio = aspectRatio;
  } else if (height != null) {
    style.height = height;
  }

  return {
    style: Object.keys(style).length > 0 ? style : undefined,
    hasCustomHeight: Boolean(aspectRatio) || height != null,
  };
}

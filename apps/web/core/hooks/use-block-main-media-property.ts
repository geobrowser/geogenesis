'use client';

import * as React from 'react';

import type { MainMediaProperty, PropertyLookup } from '~/core/blocks/data/resolve-main-media-property';
import { resolveMainMediaProperty } from '~/core/blocks/data/resolve-main-media-property';

import {
  type BlockMediaDimensions,
  NO_BLOCK_MEDIA_DIMENSIONS,
  useBlockMediaDimensions,
} from './use-block-media-dimensions';

export type BlockMainMedia = MainMediaProperty & {
  dimensions: BlockMediaDimensions;
};

/**
 * Block-level main media for list/gallery views
 */
export function useBlockMainMedia(
  shownColumnIds: readonly string[],
  properties: PropertyLookup
): BlockMainMedia | null {
  const mainMedia = resolveMainMediaProperty(shownColumnIds, properties);
  const dimensions = useBlockMediaDimensions(mainMedia?.propertyId);

  // Callers spread this into every row, and both `shownColumnIds` and the properties map are
  // rebuilt each render upstream, so memoize on the resolved values rather than on their identity.
  const propertyId = mainMedia?.propertyId ?? null;
  const kind = mainMedia?.kind ?? null;
  const name = mainMedia?.name ?? null;

  return React.useMemo(
    () => (propertyId && kind ? { propertyId, kind, name, dimensions } : null),
    [propertyId, kind, name, dimensions]
  );
}

/** Dimensions for a block that has no main media property, so callers can size without null checks. */
export function blockMainMediaDimensions(mainMedia: BlockMainMedia | null | undefined): BlockMediaDimensions {
  return mainMedia?.dimensions ?? NO_BLOCK_MEDIA_DIMENSIONS;
}

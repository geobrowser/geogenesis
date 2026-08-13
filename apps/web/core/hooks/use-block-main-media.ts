'use client';

import * as React from 'react';

import type { MainMediaProperty, PropertyLookup } from '~/core/blocks/data/resolve-main-media-property';
import { resolveMainMediaProperty } from '~/core/blocks/data/resolve-main-media-property';
import { useHydrateEntities } from '~/core/sync/use-store';

import { type BlockMediaDimensions, useBlockMediaDimensions } from './use-block-media-dimensions';

export type BlockMainMedia = MainMediaProperty & {
  dimensions: BlockMediaDimensions;
};

export type BlockMainMediaState = {
  mainMedia: BlockMainMedia | null;
  /**
   * True until the configured media dimensions are knowable. Views that size a frame from
   * them should keep showing their skeleton while it's set: `dimensions` reads as "no custom
   * size" until the property entity lands, so rendering through this window paints the whole
   * grid at the default ratio and then jumps when the real one arrives.
   */
  isFramePending: boolean;
};

type Options = {
  /**
   * Whether the caller's view sizes its media frame from the property's configured
   * Width/Height. Only the gallery does — the list crops into a fixed 64px square — and the
   * dimensions live on the property entity, which nothing else on the page fetches. Leave it
   * off and that fetch is skipped entirely, along with `isFramePending`, which would otherwise
   * report a wait no caller is going to honour.
   */
  readsDimensions?: boolean;
};

/**
 * Block-level main media for list/gallery views
 */
export function useBlockMainMedia(
  shownColumnIds: readonly string[],
  properties: PropertyLookup,
  { readsDimensions = true }: Options = {}
): BlockMainMediaState {
  // Hydrate every shown column as soon as the block's columns are known rather than waiting
  // for the property schema to tell us which one holds the media. The schema is a separate
  // round trip, so chaining off it lands the dimensions after the rows they're meant to size.
  // `useHydrateEntities` keys off the id contents, so passing a fresh array each render is fine.
  const { isFetched: areShownColumnsHydrated } = useHydrateEntities({
    ids: [...shownColumnIds],
    enabled: readsDimensions,
  });
  const shownColumnCount = shownColumnIds.length;

  const mainMedia = resolveMainMediaProperty(shownColumnIds, properties);
  const dimensions = useBlockMediaDimensions(mainMedia?.propertyId);

  // Callers spread this into every row, and both `shownColumnIds` and the properties map are
  // rebuilt each render upstream, so memoize on the resolved values rather than on their identity.
  const propertyId = mainMedia?.propertyId ?? null;
  const kind = mainMedia?.kind ?? null;
  const name = mainMedia?.name ?? null;

  const resolved = React.useMemo(
    () => (propertyId && kind ? { propertyId, kind, name, dimensions } : null),
    [propertyId, kind, name, dimensions]
  );

  return React.useMemo(
    () => ({
      mainMedia: resolved,
      isFramePending: readsDimensions && shownColumnCount > 0 && !areShownColumnsHydrated,
    }),
    [resolved, readsDimensions, shownColumnCount, areShownColumnsHydrated]
  );
}

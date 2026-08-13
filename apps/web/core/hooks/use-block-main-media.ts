'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import type { MainMediaProperty, PropertyLookup } from '~/core/blocks/data/resolve-main-media-property';
import { resolveMainMediaProperty } from '~/core/blocks/data/resolve-main-media-property';
import { ID } from '~/core/id';
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
  const mainMedia = resolveMainMediaProperty(shownColumnIds, properties);
  const { dimensions, isHydrated } = useBlockMediaDimensions(mainMedia?.propertyId);

  // Name is implicit in every block's columns and can never be the media property —
  // `resolveMainMediaProperty` skips it outright. Counting it would mean a gallery that shows
  // nothing but Name waits on a fetch that cannot change its frame.
  const mediaCandidateIds = shownColumnIds.filter(id => !ID.equals(id, SystemIds.NAME_PROPERTY));
  const mediaCandidateCount = mediaCandidateIds.length;

  // The server ships gallery shown-column properties with the page's blocks, so `isHydrated` is
  // usually already true and there's nothing to fetch or wait for. Where it isn't — the entity
  // side panel, a block whose columns changed since load — fetch every candidate column at once
  // rather than waiting for the property schema to say which one holds the media. That schema is
  // its own round trip, and chaining off it lands the dimensions after the rows they're meant to
  // size. `useHydrateEntities` keys off the id contents, so a fresh array each render is fine.
  const { isFetched: areShownColumnsHydrated } = useHydrateEntities({
    ids: mediaCandidateIds,
    enabled: readsDimensions && mediaCandidateCount > 0 && !isHydrated,
  });

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
      isFramePending: readsDimensions && mediaCandidateCount > 0 && !isHydrated && !areShownColumnsHydrated,
    }),
    [resolved, readsDimensions, mediaCandidateCount, isHydrated, areShownColumnsHydrated]
  );
}

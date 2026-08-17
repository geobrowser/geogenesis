'use client';

import * as React from 'react';

import { useCachedBrowseSidebarData } from '~/core/browse/use-browse-sidebar-cache';
import { normId } from '~/core/utils/norm-id';
import { validateSpaceId } from '~/core/utils/utils';

import { useSpacesByIds } from './use-spaces-by-ids';

export type SpaceLabel = {
  name: string;
  image: string | null;
};

export type UseSpaceLabelsResult = {
  /** Keyed by normalized id — read it through {@link spaceLabel}, not with a raw id. */
  labelsById: Map<string, SpaceLabel>;
  /** True only while an id nobody has a name for yet is still being fetched. */
  isLoading: boolean;
};

/** Reads {@link UseSpaceLabelsResult.labelsById} with the normalization the map was built with. */
export function spaceLabel(labelsById: Map<string, SpaceLabel>, spaceId: string | null | undefined) {
  return spaceId ? labelsById.get(normId(spaceId)) : undefined;
}

/**
 * Names and thumbnails for a set of spaces, resolved from whatever is already loaded before
 * anything is fetched.
 *
 * The browse sidebar has carried the viewer's featured, editor and member spaces — with names and
 * images — since first paint, and every panel in the app renders alongside it. Reading those rows
 * first is what stops a list of spaces from rendering as a column of placeholder "Space" labels
 * while a query it doesn't need re-fetches names the page already has.
 *
 * Only the ids the sidebar can't answer for are fetched, so a viewer whose spaces are all in the
 * sidebar issues no request at all.
 */
export function useSpaceLabels(spaceIds: string[]): UseSpaceLabelsResult {
  const sidebarData = useCachedBrowseSidebarData();

  const sidebarLabels = React.useMemo(() => {
    const labels = new Map<string, SpaceLabel>();
    const rows = sidebarData ? [...sidebarData.featured, ...sidebarData.editorOf, ...sidebarData.memberOf] : [];
    for (const row of rows) {
      // An unnamed row carries an id fragment as its name — a worse label than what the fetch
      // below will come back with, and not worth suppressing that fetch for.
      if (row.unnamed) continue;
      labels.set(normId(row.id), { name: row.name, image: row.image });
    }
    return labels;
  }, [sidebarData]);

  // Only real space ids can be looked up; the ones the sidebar already answered for need no lookup
  // at all. Sorted so an unchanged set keeps its query key when the caller reorders it.
  const missingIds = React.useMemo(
    () => [...new Set(spaceIds.filter(id => id && validateSpaceId(id) && !sidebarLabels.has(normId(id))))].sort(),
    [sidebarLabels, spaceIds]
  );

  const { spacesById, isLoading } = useSpacesByIds(missingIds);

  const labelsById = React.useMemo(() => {
    const labels = new Map(sidebarLabels);
    for (const [id, space] of spacesById) {
      const name = space.entity?.name?.trim();
      if (!name) continue;
      labels.set(normId(id), { name, image: space.entity?.image ?? null });
    }
    return labels;
  }, [sidebarLabels, spacesById]);

  return React.useMemo(
    () => ({ labelsById, isLoading: missingIds.length > 0 && isLoading }),
    [isLoading, labelsById, missingIds.length]
  );
}

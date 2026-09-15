'use client';

import * as React from 'react';

import type { ExploreFeedItem, ExploreFeedRow } from '~/core/explore/explore-card-item';
import { type SpaceLabel, spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';
import { useInfiniteSentinel } from '~/core/profile/use-infinite-sentinel';

import { Skeleton } from '~/design-system/skeleton';

import { ExploreFeedCard } from '~/partials/explore/explore-feed-card';

/**
 * A person's record, rendered as explore cards (GEO-2859).
 *
 * Shared by Positions and Debates, which differ only in where their ids come
 * from. `ExploreFeedCard` is the same dispatcher the explore feed uses, so a
 * claim gets the agree/disagree card and a debate gets the debate card without
 * this file knowing which is which.
 *
 * Cards are flat siblings with no wrapper and no gap, which is how the explore
 * feed renders them — each card owns its own spacing and rule. Wrapping them in
 * a spaced list is what made these read as a different surface.
 */
export function PersonRecordFeed({
  rows,
  isLoading,
  isFetchingNextPage = false,
  hasNextPage = false,
  fetchNextPage,
  loadingLabel,
  emptyLabel,
}: {
  rows: ExploreFeedRow[];
  isLoading: boolean;
  isFetchingNextPage?: boolean;
  hasNextPage?: boolean;
  fetchNextPage?: () => void;
  loadingLabel: string;
  emptyLabel: string;
}) {
  // Looked up once for the page. These are routinely spaces the viewer has never
  // opened, which the browse sidebar cannot name.
  const rowSpaceIds = React.useMemo(() => [...new Set(rows.map(row => row.spaceId))], [rows]);
  const { labelsById } = useSpaceLabels(rowSpaceIds);

  const items = React.useMemo(
    () => rows.map(row => toFeedItem(row, spaceLabel(labelsById, row.spaceId))),
    [labelsById, rows]
  );

  const noop = React.useCallback(() => {}, []);
  const sentinelRef = useInfiniteSentinel({
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage: fetchNextPage ?? noop,
  });

  if (isLoading && rows.length === 0) {
    return <p className="py-6 text-metadata text-grey-04">{loadingLabel}</p>;
  }

  if (rows.length === 0) {
    return <p className="py-6 text-metadata text-grey-04">{emptyLabel}</p>;
  }

  return (
    <div className="pt-1">
      {items.map(item => (
        <ExploreFeedCard
          key={`${item.entityId}-${item.spaceId}`}
          item={item}
          hideJoinButton
          // The claim opens in the side panel rather than navigating, as it does
          // on Explore: this is a list somebody is reading down, and losing the
          // page to read one row is a worse trade here than it is anywhere.
          titleOpensSidePanel
        />
      ))}

      {/* Well above the fold, so the next page is already in by the time the
          reader gets here — the same margin the explore feed uses. */}
      <div ref={sentinelRef} className="h-4 w-full" aria-hidden />

      {isFetchingNextPage && (
        <div className="mt-4 space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A row plus its space's name and thumbnail.
 *
 * `hasPendingMembershipRequest` is false because the Join button it belongs to
 * is hidden here — the flag only ever changes that button's label.
 */
function toFeedItem(row: ExploreFeedRow, label: SpaceLabel | undefined): ExploreFeedItem {
  return {
    ...row,
    // The same last resort the feed uses for a space with no name: an id
    // fragment, which at least differs between two spaces where a shared
    // placeholder would not.
    spaceName: label?.name ?? row.spaceId.slice(0, 8),
    spaceImage: label?.image ?? null,
    hasPendingMembershipRequest: false,
  };
}

'use client';

import * as React from 'react';

import { type ExploreFeedRow, toExploreFeedItem } from '~/core/explore/explore-card-item';
import { spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';
import type { ClaimResponse } from '~/core/profile/person-position-order';
import { useInfiniteSentinel } from '~/core/profile/use-infinite-sentinel';
import { normId } from '~/core/utils/norm-id';

import { Skeleton } from '~/design-system/skeleton';

import { ExploreFeedCard } from '~/partials/explore/explore-feed-card';

import { ClaimResponseTag } from './claim-response-tag';
import { PartialLoadError } from './partial-load-error';

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
  isError = false,
  isFetchingNextPage = false,
  hasNextPage = false,
  fetchNextPage,
  loadingLabel,
  emptyLabel,
  errorLabel,
  noun,
  responseByClaimId,
  personName,
}: {
  rows: ExploreFeedRow[];
  isLoading: boolean;
  /**
   * A request that failed, which is not the same fact as a person with nothing
   * to show. It stops the sentinel asking again for the page that just failed,
   * and — the part that was missing — it stops the empty label being printed
   * over the top of it.
   */
  isError?: boolean;
  isFetchingNextPage?: boolean;
  hasNextPage?: boolean;
  fetchNextPage?: () => void;
  loadingLabel: string;
  emptyLabel: string;
  /** Said instead of `emptyLabel` when the list could not be read at all. */
  errorLabel: string;
  /**
   * What this list holds, for the partial-failure line: "Couldn't load more
   * positions."
   */
  noun: string;
  /**
   * How the person whose record this is answered each claim, by claim id.
   *
   * Without it the Positions tab reported *which* claims somebody had answered
   * and not *how* — a record of attention with the verdict left out, which is
   * the one thing it exists to say. Absent on Debates, which has sides rather
   * than responses.
   */
  responseByClaimId?: Record<string, ClaimResponse>;
  /**
   * Whose record this is, for the response tag: "Susan agreed".
   *
   * The cards carry response controls for the *viewer*, so an unnamed verdict
   * beside them says nothing about which of the two people it describes.
   */
  personName?: string | null;
}) {
  // Looked up once for the page. These are routinely spaces the viewer has never
  // opened, which the browse sidebar cannot name.
  const rowSpaceIds = React.useMemo(() => [...new Set(rows.map(row => row.spaceId))], [rows]);
  const { labelsById } = useSpaceLabels(rowSpaceIds);

  const items = React.useMemo(
    () => rows.map(row => toExploreFeedItem(row, spaceLabel(labelsById, row.spaceId))),
    [labelsById, rows]
  );

  const noop = React.useCallback(() => {}, []);
  const sentinelRef = useInfiniteSentinel({
    hasNextPage,
    isFetchingNextPage,
    isError,
    fetchNextPage: fetchNextPage ?? noop,
  });

  if (isLoading && rows.length === 0) {
    return <p className="py-6 text-metadata text-grey-04">{loadingLabel}</p>;
  }

  // Before the empty label, and only when nothing arrived: a later page that
  // failed leaves the rows that did arrive on screen, where the sentinel has
  // already stopped asking for more.
  if (isError && rows.length === 0) {
    return <p className="py-6 text-metadata text-grey-04">{errorLabel}</p>;
  }

  if (rows.length === 0) {
    return <p className="py-6 text-metadata text-grey-04">{emptyLabel}</p>;
  }

  return (
    <div className="pt-1">
      {/*
       * The cards get a wrapper of their own so the last one is actually
       * `:last-child`. Each card draws its own rule and clears it with
       * `last:border-b-0`; with the sentinel as their next sibling, the last
       * card never matched and the list ended on a rule under nothing.
       */}
      <div>
        {items.map(item => (
          <ExploreFeedCard
            key={`${item.entityId}-${item.spaceId}`}
            item={item}
            // The card resolves the claim's response kind and hands it back, so
            // the tag is worded from the question actually asked.
            responseNote={
              responseByClaimId
                ? responseKind => (
                    <ClaimResponseTag
                      response={responseByClaimId[normId(item.entityId)]}
                      responseKind={responseKind}
                      personName={personName}
                    />
                  )
                : undefined
            }
            hideJoinButton
            // The claim opens in the side panel rather than navigating, as it
            // does on Explore: this is a list somebody is reading down, and
            // losing the page to read one row is a worse trade here than it is
            // anywhere.
            titleOpensSidePanel
          />
        ))}
      </div>

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

      {/*
       * A later page that failed, said out loud. The sentinel above has stopped
       * asking — deliberately — so without this the list simply ends early and
       * reads as complete.
       */}
      {isError && !isFetchingNextPage && fetchNextPage && <PartialLoadError noun={noun} onRetry={fetchNextPage} />}
    </div>
  );
}

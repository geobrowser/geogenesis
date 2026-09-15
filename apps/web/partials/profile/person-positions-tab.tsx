'use client';

import * as React from 'react';

import type { ExploreFeedItem, ExploreFeedRow } from '~/core/explore/explore-card-item';
import { type SpaceLabel, spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';
import { usePersonPositions } from '~/core/profile/use-person-positions';

import { ClaimExploreFeedCard } from '~/partials/explore/claim-explore-feed-card';

/**
 * The claims a person holds a position on (GEO-2859).
 *
 * Claims, not votes — a vote is an event with nothing to show, where a claim has
 * a name, a tally and a space. That is also what lets the explore feed's own
 * card render this untouched.
 *
 * Paged rather than infinite: the record is ordered by when they voted, and a
 * cursor that holds its place is worth more here than continuous scroll on a
 * list somebody is reading rather than browsing.
 */
export function PersonPositionsTab({ spaceId }: { spaceId: string }) {
  const [cursors, setCursors] = React.useState<(string | undefined)[]>([undefined]);
  const after = cursors[cursors.length - 1];

  const { page, isLoading, isPlaceholderData } = usePersonPositions({ spaceId, after });

  // The spaces the rows landed in, which are routinely ones the viewer has never
  // opened. Looked up once for the page rather than per card.
  const rowSpaceIds = React.useMemo(() => [...new Set(page.rows.map(row => row.spaceId))], [page.rows]);
  const { labelsById } = useSpaceLabels(rowSpaceIds);

  const items = React.useMemo(
    () => page.rows.map(row => toFeedItem(row, spaceLabel(labelsById, row.spaceId))),
    [labelsById, page.rows]
  );

  if (isLoading && page.rows.length === 0) {
    return <p className="py-6 text-metadata text-grey-04">Loading positions…</p>;
  }

  if (page.rows.length === 0) {
    return <p className="py-6 text-metadata text-grey-04">No positions on claims yet.</p>;
  }

  return (
    <section className="flex flex-col gap-4">
      <ul className="flex flex-col gap-4">
        {items.map(item => (
          <li key={`${item.entityId}-${item.spaceId}`}>
            <ClaimExploreFeedCard item={item} hideJoinButton />
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled={cursors.length === 1 || isPlaceholderData}
          onClick={() => setCursors(previous => previous.slice(0, -1))}
          className="text-metadata text-ctaPrimary disabled:text-grey-03"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={!page.hasNextPage || page.endCursor === null || isPlaceholderData}
          onClick={() => page.endCursor && setCursors(previous => [...previous, page.endCursor ?? undefined])}
          className="text-metadata text-ctaPrimary disabled:text-grey-03"
        >
          Next
        </button>
      </div>
    </section>
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

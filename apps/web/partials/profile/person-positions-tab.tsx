'use client';

import { usePersonPositions } from '~/core/profile/use-person-positions';

import { PersonRecordFeed } from './person-record-feed';

/**
 * The claims a person holds a position on (GEO-2859).
 *
 * Claims, not votes — a vote is an event with nothing to show, where a claim has
 * a name, a tally and a space. That is also what lets the explore feed's own
 * card render this untouched.
 */
export function PersonPositionsTab({ spaceId }: { spaceId: string }) {
  const { rows, isLoading, isError, isFetchingNextPage, hasNextPage, fetchNextPage } = usePersonPositions({ spaceId });

  return (
    <PersonRecordFeed
      rows={rows}
      isLoading={isLoading}
      isError={isError}
      isFetchingNextPage={isFetchingNextPage}
      hasNextPage={hasNextPage}
      fetchNextPage={fetchNextPage}
      loadingLabel="Loading positions…"
      emptyLabel="No positions on claims yet."
    />
  );
}

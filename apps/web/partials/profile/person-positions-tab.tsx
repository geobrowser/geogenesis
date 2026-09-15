'use client';

import * as React from 'react';

import { usePersonPositions } from '~/core/profile/use-person-positions';

import { PersonRecordFeed } from './person-record-feed';

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

  return (
    <PersonRecordFeed
      rows={page.rows}
      isLoading={isLoading}
      isPlaceholderData={isPlaceholderData}
      hasNextPage={page.hasNextPage}
      endCursor={page.endCursor}
      loadingLabel="Loading positions…"
      emptyLabel="No positions on claims yet."
      canGoBack={cursors.length > 1}
      onBack={() => setCursors(previous => previous.slice(0, -1))}
      onNext={cursor => setCursors(previous => [...previous, cursor])}
    />
  );
}

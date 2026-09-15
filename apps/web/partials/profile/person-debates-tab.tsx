'use client';

import { usePersonDebates } from '~/core/debates/use-person-debates';

import { PersonRecordFeed } from './person-record-feed';

/**
 * The debates a person argued (GEO-2859).
 *
 * Explore cards, not the full-screen player. This is a record being read
 * alongside the rest of a profile, and a viewport-filling swipe feed takes the
 * page over — the same reason Positions renders cards rather than opening the
 * first claim. `DebateExploreFeedCard` still plays the debate in place.
 *
 * Unpaged, deliberately: the list is bounded by how many debates one person has
 * argued, which is eleven at the top of the graph.
 */
export function PersonDebatesTab({ spaceId }: { spaceId: string }) {
  const { rows, isLoading, isError } = usePersonDebates(spaceId, true);

  if (isError) {
    return <p className="py-6 text-metadata text-grey-04">Couldn’t load debates.</p>;
  }

  return (
    <PersonRecordFeed
      rows={rows}
      isLoading={isLoading}
      isPlaceholderData={false}
      hasNextPage={false}
      endCursor={null}
      loadingLabel="Loading debates…"
      // Said here rather than by the browse feed, which offers "Start one from
      // the Claims tab" — right for a space with no debates in it, wrong for a
      // person who has never been in one.
      emptyLabel="No debates yet."
      canGoBack={false}
      onBack={() => {}}
      onNext={() => {}}
    />
  );
}

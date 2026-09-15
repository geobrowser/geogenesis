'use client';

import * as React from 'react';

import { usePersonDebates } from '~/core/debates/use-person-debates';

import { DebatesBrowseFeed } from './debate-feed';

/**
 * A person's debates, in the feed everyone else watches debates in (GEO-2859).
 *
 * The presentation is the browse feed unchanged — full screen, infinite scroll,
 * the same playback. Only the list differs: the graph says which debates this
 * person argued, because geo-chat cannot be asked about a personal space.
 */
export function PersonDebateFeed({ spaceId }: { spaceId: string }) {
  const { debates, isLoading, isError, isEmpty } = usePersonDebates(spaceId, true);

  const source = React.useMemo(() => ({ debates, isLoading, isError }), [debates, isError, isLoading]);

  // Said here rather than by the feed, which would say "Start one from the
  // Claims tab" — right for a space with no debates in it, wrong for a person
  // who has not been in one.
  if (isEmpty) {
    return (
      <div className="flex min-h-[40dvh] items-center justify-center px-4">
        <p className="text-center text-metadata text-grey-04">This person hasn’t been in a debate yet.</p>
      </div>
    );
  }

  return <DebatesBrowseFeed spaceId={spaceId} source={source} />;
}

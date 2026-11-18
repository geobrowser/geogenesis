'use client';

import * as React from 'react';

import { normId } from '~/core/utils/norm-id';

import type { FeedInterleave } from '~/partials/feed/entity-feed';

import { usePastCalls } from './hooks';
import { PastCallCard } from './past-call-card';
import { pastCallSlots } from './past-calls-interleave';

/**
 * Explore's past-call cards for `EntityFeed`'s `interleave` (GEO-3421), or `undefined` while there
 * are none. The list loads beside the feed, never ahead of it, and a failed read draws nothing.
 * Once the feed reaches the last loaded call, the next page loads; a call's slot depends only on
 * its index, so a new page only adds cards further down.
 */
export function usePastCallInterleave(enabled: boolean) {
  const { data: calls, hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = usePastCalls(enabled);
  // A failed page stops paging; the calls already drawn stay.
  const canLoadMore = hasNextPage && !isFetchingNextPage && !isFetchNextPageError;

  return React.useMemo((): FeedInterleave | undefined => {
    if (!enabled || !calls || calls.length === 0) return undefined;
    return (feedLength: number) => {
      const cards = new Map<number, React.ReactNode>();
      const replacesEntityIds = new Set<string>();
      for (const [afterIndex, callIndex] of pastCallSlots(feedLength, calls.length)) {
        const call = calls[callIndex]!;
        const last = callIndex === calls.length - 1;
        cards.set(
          afterIndex,
          <React.Fragment key={`past-call-${call.call_id}`}>
            <PastCallCard call={call} />
            {last && canLoadMore ? <LoadMorePastCalls load={fetchNextPage} /> : null}
          </React.Fragment>
        );
        // A placed call written to the graph is also its Call Event card; this one plays, so it stands for both.
        if (call.entity_id) replacesEntityIds.add(normId(call.entity_id));
      }
      return { cards, replacesEntityIds };
    };
  }, [calls, canLoadMore, enabled, fetchNextPage]);
}

function LoadMorePastCalls({ load }: { load: () => unknown }) {
  React.useEffect(() => {
    void load();
  }, [load]);
  return null;
}

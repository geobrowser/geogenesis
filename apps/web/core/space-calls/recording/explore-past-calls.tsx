'use client';

import * as React from 'react';

import { usePastCalls } from './hooks';
import { PastCallCard } from './past-call-card';
import { pastCallSlots } from './past-calls-interleave';

/**
 * Explore's past-call cards for `EntityFeed`'s `interleave` (GEO-3421), or `undefined` while there
 * are none. The list loads beside the feed, never ahead of it, and a failed read draws nothing.
 */
export function usePastCallInterleave(enabled: boolean) {
  const calls = usePastCalls(enabled).data;

  return React.useMemo(() => {
    if (!enabled || !calls || calls.length === 0) return undefined;
    return (feedLength: number) => {
      const cards = new Map<number, React.ReactNode>();
      for (const [afterIndex, callIndex] of pastCallSlots(feedLength, calls.length)) {
        const call = calls[callIndex]!;
        cards.set(afterIndex, <PastCallCard key={`past-call-${call.call_id}`} call={call} />);
      }
      return cards;
    };
  }, [calls, enabled]);
}

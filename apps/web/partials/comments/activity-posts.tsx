'use client';

import * as React from 'react';

/**
 * How many comments the reader has added to this thread since it loaded.
 *
 * The Activity heading's number is a server aggregate — the claim's debates, the claims extracted
 * from them, and every comment anywhere in that tree. It is the only way to count things the section
 * does not hold, and it is also why publishing used to leave the heading standing still: the
 * aggregate answered before the comment existed, and nothing in the comment caches can move a number
 * that counts debates and extracted claims too.
 *
 * So the aggregate is a baseline and this is the delta. Every composer inside the section reports
 * here — the top-level one and the inline ones on debates, extracted claims and replies — because a
 * reader who has just written something expects the count above to have noticed.
 *
 * The baseline has to hold still for that to be right: `useClaimActivityCounts` does not refetch on
 * window focus, so a refetch that already included these posts cannot land underneath and make the
 * delta count them twice. Navigating away and back re-reads the aggregate and resets the delta,
 * which is the same answer arrived at from the other side.
 */
const ActivityPostsContext = React.createContext<((delta: number) => void) | null>(null);

export function ActivityPostsProvider({
  onAdjust,
  children,
}: {
  onAdjust: (delta: number) => void;
  children: React.ReactNode;
}) {
  return <ActivityPostsContext.Provider value={onAdjust}>{children}</ActivityPostsContext.Provider>;
}

/**
 * Reports a comment appearing or disappearing here, if anything is counting.
 *
 * A signed delta rather than a bare "posted", because a publish can fail: `useCreateComment` removes
 * the optimistic row when the transaction is rejected, and without the matching `-1` the heading
 * stayed one above the truth for as long as the page was open. A publish that is merely *retained*
 * for retry keeps its row, so it keeps its `+1`.
 *
 * Returns a no-op outside a provider rather than throwing: the same composer runs in the entity
 * comments panel and on proposal threads, neither of which has a heading with an aggregate behind
 * it.
 */
export function useAdjustActivityPosts(): (delta: number) => void {
  const adjust = React.useContext(ActivityPostsContext);
  return React.useCallback((delta: number) => adjust?.(delta), [adjust]);
}

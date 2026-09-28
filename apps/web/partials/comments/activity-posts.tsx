'use client';

import * as React from 'react';

/**
 * A comment the reader just published, reported to whoever owns the heading's number.
 *
 * The Activity heading's number is a server aggregate — the claim's debates, the claims extracted
 * from them, and every comment anywhere in that tree. It is the only way to count things the section
 * does not hold, and it is also why publishing used to leave the heading standing still: the
 * aggregate answered before the comment existed, and nothing in the comment caches can move a number
 * that counts debates and extracted claims too.
 *
 * So every composer inside the section reports here — the top-level one and the inline ones on
 * debates, extracted claims and replies — because a reader who has just written something expects
 * the count above to have noticed.
 *
 * What it reaches is the host's adjustment, not a counter kept here. That matters, and it is the
 * whole history of this file: the count used to live in `CommentSection`'s own state, which meant it
 * was lost every time the section unmounted — a reader who posted, left and came back inside the
 * aggregate's `staleTime` got the pre-publish number with an empty delta — and kept every time the
 * section was reused for a different record, since `EntityPageBody` is not remounted between claims.
 * The claim page now moves the aggregate in the query cache instead, which is keyed by claim and
 * lives exactly as long as the number it corrects.
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
 * stayed one above the truth. A publish that is merely *retained* for retry keeps its row, so it
 * keeps its `+1`.
 *
 * Returns a no-op outside a provider rather than throwing: the same composer runs in the entity
 * comments panel and on proposal threads, neither of which has a heading with an aggregate behind
 * it.
 */
export function useAdjustActivityPosts(): (delta: number) => void {
  const adjust = React.useContext(ActivityPostsContext);
  return React.useCallback((delta: number) => adjust?.(delta), [adjust]);
}

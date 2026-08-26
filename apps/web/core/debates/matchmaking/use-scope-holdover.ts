'use client';

import * as React from 'react';

/**
 * Whether the pages in hand were fetched under a different scope than the one now in force.
 *
 * `placeholderData: keepPreviousData` holds the last query key's pages while the next request is in
 * flight, which is what stops the list blinking on every keystroke. For a search, topic or space
 * change that hold is exactly right: the data is the previous answer to a question the viewer is
 * still asking, and the rows on screen are that same held page, so the menu describing them is
 * honest.
 *
 * A change of *scope* — which spaces this viewer may be shown claims from at all — is the one case
 * where the held data is not merely stale but wrong. The rows are re-gated on the way out, so they
 * narrow the moment the scope does; the facets riding with them are not, because a topic facet
 * carries no space to gate it by. For the length of that request the menu offers topics from spaces
 * the list has already stopped showing, which is the whole of GEO-2653 arriving through a different
 * door.
 *
 * Pass a key that identifies the scope, and the query's own `isPlaceholderData`.
 */
export function useScopeHeldOver(scopeKey: string | null, isPlaceholderData: boolean): boolean {
  const fetchedUnder = React.useRef(scopeKey);

  // Written during render, and safe for the same reason `useStableListOrder`'s is: the result is a
  // fixed point. Settled data means the scope in force is the one it was fetched under, so a
  // discarded or double-invoked render recomputes the same answer.
  if (!isPlaceholderData) fetchedUnder.current = scopeKey;

  return fetchedUnder.current !== scopeKey;
}

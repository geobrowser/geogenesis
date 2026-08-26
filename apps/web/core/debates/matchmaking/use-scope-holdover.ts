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
  const [fetchedUnder, setFetchedUnder] = React.useState(scopeKey);

  // React's sanctioned "adjust state during render" escape hatch rather than a ref written in the
  // same place. A ref would survive a render that never commits: a speculative pass for scope B
  // could record B, be thrown away, and leave the committed tree for scope A masking its own
  // pages. State set during render is discarded with the render that set it, so an abandoned pass
  // leaves nothing behind. React re-runs this component immediately with the new value, before
  // anything commits, so it costs no extra frame.
  if (!isPlaceholderData && fetchedUnder !== scopeKey) setFetchedUnder(scopeKey);

  return fetchedUnder !== scopeKey;
}

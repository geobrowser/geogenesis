'use client';

import * as React from 'react';

import { mergeBallotOrders, sameBallotOrder } from '~/core/blocks/ranking/ranking-draft-merge';

/**
 * The compose screen's draft order, seeded from the author's published ballot and re-seeded when
 * that changes.
 *
 * By default a change to the published order replaces the draft, as the screen always did. With
 * `keepLocalChanges` (Best debates, GEO-3678), a draft that differs from the order it was seeded
 * from is merged onto the new published order instead (three-way, `mergeBallotOrders`): a placement
 * waiting on "Placed #N of M", or drags not yet published, survive a refetch that lands meanwhile
 * (an earlier placement finishing indexing, a window refocus).
 *
 * `markPublished(ids)` moves the merge base to what this device just published. Without it the base
 * stays on the older order until the index catches up, and a drag or removal of a just-published
 * debate made meanwhile would be undone when the published order lands.
 *
 * Stitch note (#3102): its `unsavedDraft` must enter through `setOrderedIds`, never as
 * `publishedIds`, or the merge would treat an unsaved draft as published.
 */
export function useRankingDraftOrder(publishedIds: readonly string[], keepLocalChanges: boolean) {
  const [orderedIds, setOrderedIds] = React.useState<string[]>(() => [...publishedIds]);
  const baseRef = React.useRef<readonly string[]>(publishedIds);
  const keepLocalChangesRef = React.useRef(keepLocalChanges);
  keepLocalChangesRef.current = keepLocalChanges;

  const publishedKey = publishedIds.join('|');

  React.useEffect(() => {
    const next = publishedIds;
    const base = baseRef.current;
    baseRef.current = next;
    setOrderedIds(prev => {
      if (!keepLocalChangesRef.current) {
        return prev.length === next.length && prev.every((id, index) => id === next[index]) ? prev : [...next];
      }
      if (sameBallotOrder(prev, next)) return prev;
      if (sameBallotOrder(prev, base)) return [...next];
      return mergeBallotOrders({ base, ours: prev, theirs: next }).ids;
    });
    // `publishedKey` is the joined signature of `publishedIds`, and stands in for it: the array is
    // rebuilt on every render of the query, and this only wants to re-seed when the order changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishedKey]);

  const markPublished = React.useCallback((ids: readonly string[]) => {
    baseRef.current = [...ids];
  }, []);

  return [orderedIds, setOrderedIds, markPublished] as const;
}

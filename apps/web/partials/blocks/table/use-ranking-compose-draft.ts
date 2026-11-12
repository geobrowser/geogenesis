'use client';

import * as React from 'react';

import { mergeBallotOrders, sameBallotOrder } from '~/core/blocks/ranking/ranking-publish-queue';
import type { UnsavedRankingDraft } from '~/core/blocks/ranking/ranking-publish-queue';

/** What the compose screen's list starts from, and the published ballot that
 *  list is based on (what publishing it passes as `basedOnOrderedIds`). */
export type RankingComposeSeed = { ids: string[]; base: string[] };

/**
 * The seed, in order of precedence (GEO-3680):
 * 1. a draft handed back after another device's edit overtook ours, based on
 *    the draft itself: the publish path folds the overtaken edit and the other
 *    device's ballot into the published side, so basing on anything earlier
 *    would read the ranker removing an item of the draft as "unchanged" and
 *    bring it back;
 * 2. otherwise the published ballot, based on itself.
 * The ranker's own unpublished edits are then merged onto whichever it is (see
 * `useRankingComposeDraft`).
 */
export function rankingComposeSeed(
  unsavedDraft: UnsavedRankingDraft | null,
  publishedIds: string[] | undefined
): RankingComposeSeed {
  if (unsavedDraft) return { ids: unsavedDraft.orderedEntityIds, base: unsavedDraft.orderedEntityIds };
  const ids = publishedIds ?? [];
  return { ids, base: ids };
}

/**
 * The compose screen's editable list. When the seed changes (the published
 * ballot moved, or a draft was handed back), an editor with no edits of its
 * own takes the new seed; an editor with edits keeps them, merged onto it
 * (three-way, against the previous seed), so a concurrent change never wipes
 * what the ranker is in the middle of.
 */
export function useRankingComposeDraft(seed: RankingComposeSeed) {
  const [orderedIds, setOrderedIds] = React.useState<string[]>(seed.ids);
  const seedRef = React.useRef(seed);
  const seedKey = `${seed.ids.join('|')}#${seed.base.join('|')}`;

  React.useEffect(() => {
    const previous = seedRef.current;
    seedRef.current = seed;
    setOrderedIds(current => {
      const next = sameBallotOrder(current, previous.ids)
        ? seed.ids
        : mergeBallotOrders({ base: previous.ids, ours: current, theirs: seed.ids }).ids;
      return sameBallotOrder(next, current) ? current : next;
    });
    // `seedKey` is the joined signature of `seed`, which is rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);

  /** The published ballot the current list is based on, for `basedOnOrderedIds`. */
  const getBasedOnOrderedIds = React.useCallback(() => seedRef.current.base, []);

  /**
   * Moves the merge base to what this device just published (GEO-3678, Best debates' placements).
   * Without it the base stays on the older seed until the index catches up, and a drag or removal
   * of a just-published item made meanwhile would be undone when the published order lands.
   */
  const markPublished = React.useCallback((ids: readonly string[]) => {
    seedRef.current = { ids: [...ids], base: [...ids] };
  }, []);

  return { orderedIds, setOrderedIds, getBasedOnOrderedIds, markPublished };
}

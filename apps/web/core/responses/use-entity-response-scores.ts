'use client';

import { useQueries } from '@tanstack/react-query';

import * as React from 'react';

import { uuidToHex } from '~/core/id/normalize';

import { type ResponseKind, type ResponseObjectType, entityResponseCountsQueryKey } from './entity-response';

/** Entity votes, as opposed to claim-position votes. Same 0 `EntityVoteButtons` writes under. */
const ENTITY_RESPONSE_OBJECT_TYPE: ResponseObjectType = 0;

export type ScoredEntity = {
  entityId: string;
  /** The space the response was recorded against — for a comment, its author's personal space. */
  spaceId: string;
  responseKind?: ResponseKind;
};

/**
 * Net upvote score per entity, read from the cache the vote controls already fill.
 *
 * Every row that renders `EntityVoteButtons` fetches its own counts under
 * {@link entityResponseCountsQueryKey} and keeps them for 30s. This hook subscribes to those same
 * entries **without enabling them**, so ordering a list by score costs no request of its own — the
 * same arrangement `useCommentCount` has with the comment list, and for the same reason: a feed
 * that fetched a number per row to decide the order would pay a round trip per row before it could
 * draw anything.
 *
 * What that buys is also its limit: a score is only known once the row that owns it has asked.
 * Callers get `null` for anything unanswered and decide what that means — see
 * {@link netScore}. Sorting treats it as zero, which is the honest reading of "nobody has
 * told us otherwise" and is what the control itself displays in the meantime.
 *
 * Space matters. Comment votes are recorded against the commenter's own personal space, not the
 * space the thread is being read in, so callers must pass the space each entity actually lives in
 * rather than the page's.
 */
export type ResponseCounts = { positive: number; negative: number };

export function useEntityResponseScores(targets: ScoredEntity[]): Map<string, ResponseCounts | null> {
  // Deduped and ordered, so a list that re-renders with the same entities in a different order
  // doesn't rebuild every subscription.
  const normalized = React.useMemo(() => {
    const byKey = new Map<string, ScoredEntity>();
    for (const target of targets) {
      if (!target.entityId || !target.spaceId) continue;
      byKey.set(`${uuidToHex(target.entityId)}:${uuidToHex(target.spaceId)}`, target);
    }
    return [...byKey.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [targets]);

  const results = useQueries({
    queries: normalized.map(([, target]) => ({
      queryKey: entityResponseCountsQueryKey(
        target.entityId,
        target.spaceId,
        ENTITY_RESPONSE_OBJECT_TYPE,
        target.responseKind ?? 'curation'
      ),
      // A cache subscription, not a second reader. `EntityVoteButtons` owns the fetching; enabling
      // these would double every row's request and race its own optimistic writes.
      enabled: false,
    })),
  });

  return React.useMemo(() => {
    const scores = new Map<string, ResponseCounts | null>();
    normalized.forEach(([, target], index) => {
      const counts = results[index]?.data as ResponseCounts | undefined;
      scores.set(uuidToHex(target.entityId), counts ?? null);
    });
    return scores;
    // `results` is a new array every render by design; its contents are what matter, and the map
    // below is cheap. Keyed on the data itself so a genuine count change rebuilds it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalized, results.map(result => JSON.stringify(result.data ?? null)).join('|')]);
}

/** Net score for ordering: unknown counts as zero, which is what the control shows until it answers. */
export function netScore(counts: ResponseCounts | null | undefined): number {
  return counts ? counts.positive - counts.negative : 0;
}

/** Upvotes alone — how many people backed it, regardless of how many pushed back. */
export function upvoteCount(counts: ResponseCounts | null | undefined): number {
  return counts?.positive ?? 0;
}

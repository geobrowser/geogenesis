'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import type { CommentEntity } from '~/partials/comments/types';

/**
 * The comment count as the client currently knows it, seeded by a server-rendered one.
 *
 * Counts beside a comment icon are rendered by a server component next to whatever they label,
 * which is cheap but frozen: posting a comment writes the new row into the `['comments', entityId]`
 * cache and nothing re-runs the server count, so the number sits one behind the list it describes
 * until the page is reloaded.
 *
 * Subscribing to that cache key — without enabling the query — makes the count follow every write to
 * the list: optimistic, published, deleted. It costs no request of its own, because it never fetches.
 *
 * The cache does not win unconditionally, though. Because this hook subscribes, the entry is never
 * collected while any surface showing a count stays mounted, and nothing here refetches it — so a
 * list left over from an earlier panel visit would otherwise outrank a number the server rendered
 * just now, and keep outranking it indefinitely. It wins only when it knows something that number
 * cannot: it was written after the number was handed to us, or it holds rows that have not been
 * published yet.
 */
export function useCommentCount(entityId: string, serverCount: number): number {
  const { data, dataUpdatedAt } = useQuery<CommentEntity[]>({
    queryKey: ['comments', entityId],
    // A cache subscription, not a second reader of the list — `useComments` owns the fetching, and
    // this hook is rendered on surfaces (cards, feed rows) where fetching every count would be a
    // request per row for a number.
    enabled: false,
  });

  // When this server count reached us, as closely as a client can tell: a different value means a
  // different server render. Held in state rather than recomputed, because a later timestamp would
  // move the comparison below and could drop a live count that had already won it.
  //
  // Keyed on the entity as well as the count. This hook is rendered on surfaces that swap which
  // entity they are about without remounting, and two entities can easily have the same number of
  // comments — so a seed keyed on the count alone would keep the previous entity's timestamp, and a
  // stale list for the new entity could then look newer than it and outrank a fresh server count.
  const [seed, setSeed] = React.useState(() => ({ entityId, count: serverCount, at: Date.now() }));
  if (seed.entityId !== entityId || seed.count !== serverCount) {
    setSeed({ entityId, count: serverCount, at: Date.now() });
  }

  if (!data) return serverCount;

  // Rows still being published are local knowledge the server provably does not have yet, whatever
  // the timestamps say — the indexer is behind by design.
  const unpublishedRows = data.filter(comment => comment.isPendingPublish === true).length;

  if (unpublishedRows > 0) {
    // A pending row proves the server count is short by at least that many. It does not prove the
    // cache holds every server row: `useCreateComment` seeds this entry with `(old = [])`, so posting
    // before the list has loaded — or after that query failed — leaves it holding nothing but the new
    // comment, and trusting its length would drop a count of 5 to 1.
    //
    // Both numbers are lower bounds on the truth, so the larger one is the better answer. It can
    // over-report only where a deletion has already shrunk the cache below a server count that has
    // not caught up, which is the same staleness the branch below already prefers the server for.
    return Math.max(data.length, serverCount + unpublishedRows);
  }

  return dataUpdatedAt > seed.at ? data.length : serverCount;
}

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

  // Rows added locally and not yet seen coming back from the server. The flag is not a claim that the
  // server lacks them — it means "keep this row through refetches", and it stays set after publishing
  // until `mergePendingWithServer` sees the indexer return the comment — so it cannot be added to a
  // server count on its own without double counting one that has caught up.
  const optimisticRows = data.filter(comment => comment.isPendingPublish === true).length;
  const serverRows = data.length - optimisticRows;

  if (dataUpdatedAt > seed.at) {
    // Rows the list fetched are proof the fetch happened, and `mergePendingWithServer` guarantees what
    // it leaves behind is the server's rows plus whatever is still only local — so the length is the
    // whole count, whether or not the server's own number has caught up.
    //
    // An empty list counts as an answer too. The list filters what the count merely counted — the count
    // is backlink ids, the list drops any whose relations do not come back — so it can legitimately
    // answer none where the count said five, and a pill reading five beside a visibly empty panel is
    // the worse of the two wrongs.
    if (serverRows > 0 || data.length === 0) return data.length;

    // Nothing from the server in here, so this entry holds only what was written into it:
    // `useCreateComment` seeds it with `(old = [])`, and posting before the list has loaded — or after
    // that query failed — leaves nothing but the new comment. Its length would read 1 where the server
    // knows 5, so the server count is the base those local rows are added to.
    return serverCount + optimisticRows;
  }

  // The cache predates this server count, so the count is the better record — including where a row in
  // it is still flagged. That flag outlives publishing, so adding it to a count that has already
  // caught up would report the same comment twice.
  return serverCount;
}

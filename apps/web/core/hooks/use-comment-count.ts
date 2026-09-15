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
  const [seed, setSeed] = React.useState(() => ({ count: serverCount, at: Date.now() }));
  if (seed.count !== serverCount) {
    setSeed({ count: serverCount, at: Date.now() });
  }

  if (!data) return serverCount;

  // A row still being published is local knowledge the server provably does not have yet, whatever
  // the timestamps say — the indexer is behind by design.
  const hasUnpublishedRows = data.some(comment => comment.isPendingPublish === true);

  return hasUnpublishedRows || dataUpdatedAt > seed.at ? data.length : serverCount;
}

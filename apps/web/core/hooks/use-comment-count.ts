'use client';

import { useQuery } from '@tanstack/react-query';

import type { CommentEntity } from '~/partials/comments/types';

/**
 * The comment count as the client currently knows it, seeded by a server-rendered one.
 *
 * Counts beside a comment icon are rendered by a server component next to whatever they label,
 * which is cheap but frozen: posting a comment writes the new row into the `['comments', entityId]`
 * cache and nothing re-runs the server count, so the number sits one behind the list it describes
 * until the page is reloaded.
 *
 * Subscribing to that cache key — without enabling the query — makes the count follow every write
 * to the list: optimistic, published, deleted. It costs no request of its own, because it never
 * fetches; until something that does have the list mounts (opening the panel is what does), there
 * is nothing cached and the server count stands.
 */
export function useCommentCount(entityId: string, serverCount: number): number {
  const { data } = useQuery<CommentEntity[]>({
    queryKey: ['comments', entityId],
    // A cache subscription, not a second reader of the list — `useComments` owns the fetching, and
    // this hook is rendered on surfaces (cards, feed rows) where fetching every count would be a
    // request per row for a number.
    enabled: false,
  });

  return data?.length ?? serverCount;
}

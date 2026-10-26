import { type QueryClient, queryOptions } from '@tanstack/react-query';

import { fetchCommentEntitiesForTarget, mergePendingWithServer } from '~/core/hooks/use-comments';
import { commentsFetchedQueryKey } from '~/core/io/query-keys';

import type { CommentEntity } from '~/partials/comments/types';

/**
 * The comment list query, shared by every observer of `['comments', id]`. The query runs with the options
 * of whichever observer rendered last, so an observer without this `queryFn` could leave a refetch with
 * nothing to call. Its own module so suites that mock
 * `use-comments` can still render a count.
 */
export function commentsQueryOptions(queryClient: QueryClient, entityId: string) {
  return queryOptions({
    queryKey: ['comments', entityId],
    // react-query passes an AbortSignal here; threading it through cancels in-flight GraphQL
    // work when the component unmounts or the query is invalidated mid-flight.
    queryFn: async ({ signal }): Promise<CommentEntity[]> => {
      const server = await fetchCommentEntitiesForTarget(entityId, signal);
      const prev = queryClient.getQueryData<CommentEntity[]>(['comments', entityId]);
      // Recorded because this entry has other writers, and an empty list from here means something
      // different from an empty one left behind by a rolled-back optimistic row — see the key's own
      // note. Set after the fetch resolves, so it marks an answer rather than an attempt.
      queryClient.setQueryData(commentsFetchedQueryKey(entityId), true);
      return mergePendingWithServer(server, prev);
    },
  });
}

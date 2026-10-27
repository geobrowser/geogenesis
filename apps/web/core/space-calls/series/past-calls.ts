'use client';

import { useInfiniteQuery } from '@tanstack/react-query';

import { debateQueryNetworkOptions } from '~/core/debates/hooks';

import { spacePastCallsQueryKey } from '../query-keys';
import { listPastCalls } from '../recording/api';

export const SPACE_PAST_CALLS_PAGE = 20;

/** A space's past calls, recorded or not, a page at a time (GEO-3420). */
export function useSpacePastCalls(spaceId: string, enabled = true) {
  return useInfiniteQuery({
    ...debateQueryNetworkOptions,
    queryKey: spacePastCallsQueryKey(spaceId),
    queryFn: ({ pageParam, signal }) =>
      listPastCalls({ limit: SPACE_PAST_CALLS_PAGE, spaceId, cursor: pageParam }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: page => page.next_cursor,
    enabled: enabled && Boolean(spaceId),
  });
}

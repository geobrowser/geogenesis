'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { type TopicMetadata, fetchTopicMetadata } from '~/core/io/subgraph/fetch-topic-metadata';
import { normId } from '~/core/utils/norm-id';

/**
 * Names and images for a set of topic entity ids, resolved without a space id.
 *
 * The result is re-keyed through `normId` so a lookup by the normalized ids every follow consumer
 * already holds is guaranteed to hit, whatever casing the graph returned.
 */
export function useTopicMetadata(topicIds: readonly string[]) {
  const ids = React.useMemo(() => [...new Set(topicIds.map(normId))].sort(), [topicIds]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['topic-metadata', ids],
    queryFn: async () => {
      const resolved = await fetchTopicMetadata(ids);
      return new Map([...resolved].map(([id, meta]) => [normId(id), meta] as const));
    },
    enabled: ids.length > 0,
    staleTime: 60_000,
    // A list that loses one id (an unfollow) keeps drawing the names it has while the new set loads,
    // instead of dropping back to a loading state that would unmount whatever is showing them.
    placeholderData: keepPreviousData,
  });

  const metadata = React.useMemo<Map<string, TopicMetadata>>(() => data ?? new Map(), [data]);

  return { metadata, isLoading: ids.length > 0 && isLoading, isError };
}

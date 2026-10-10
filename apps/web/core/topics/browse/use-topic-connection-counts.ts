'use client';

import { useQueries } from '@tanstack/react-query';

import * as React from 'react';

import {
  type TopicConnectionCounts,
  fetchTopicConnectionCountsBatch,
  topicConnectionCountsQueryKey,
  topicCountBatches,
} from './topic-connection-counts';

export {
  EMPTY_TOPIC_CONNECTION_COUNTS,
  TOPIC_COUNT_BATCH_SIZE,
  decodeTopicConnectionCounts,
  topicConnectionCountsDocument,
  topicCountBatches,
  type TopicConnectionCounts,
} from './topic-connection-counts';

type CountsQueryResult = { data?: Record<string, TopicConnectionCounts>; isLoading: boolean; isError: boolean };

function combineTopicConnectionCounts(queries: CountsQueryResult[]) {
  // `null`, not `{}`, while nothing has answered: an empty map is indistinguishable from a topic
  // the counts came back empty for, and the card draws no metadata line for either.
  const answered = queries.filter(query => query.data);

  return {
    countsByTopicId: answered.length > 0 ? Object.assign({}, ...answered.map(query => query.data)) : null,
    isLoading: queries.some(query => query.isLoading),
    /**
     * A failed count is not an empty one. The tab still lists its topics, in the order the claim
     * carries them in, rather than printing zeros for numbers nobody measured.
     *
     * True of a *partial* failure too, which is why this is `some` rather than `every`: with more
     * than one batch, one can fail while another answers, and half the numbers cannot order the
     * list. The cards whose batch did answer still get their own counts; the rest draw no metadata
     * line.
     */
    isError: queries.some(query => query.isError),
  };
}

/**
 * Claims, news stories and debates attached to each of these topics.
 *
 * Returns a map rather than an array so a caller can look a topic up without depending on the
 * order it asked in — which is the point, since the order it renders in is derived from these
 * numbers.
 */
export function useTopicConnectionCounts(topicIds: string[]) {
  const batches = React.useMemo(() => topicCountBatches(topicIds), [topicIds]);

  return useQueries({
    queries: batches.map(ids => ({
      queryKey: topicConnectionCountsQueryKey(ids),
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchTopicConnectionCountsBatch(ids, signal),
      staleTime: 30_000,
    })),
    combine: combineTopicConnectionCounts,
  });
}

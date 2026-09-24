'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { ID } from '~/core/id';

import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

import type { TopicFeedCompositionCounts } from './topic-feed-facets';
import { TOPIC_FEED_ENTITY_TYPES } from './topic-feed-types';

type Bucket = { key: string; label: string; count: number; color: string };

export function useTopicComposition(topicId: string, spaceId: string, spaceIds: string[] | undefined) {
  const { data, isLoading } = useQuery({
    queryKey: ['topic', 'composition', ID.uuidToHex(topicId), ID.uuidToHex(spaceId), spaceIds],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ topicId, spaceId, spaceIds: spaceIds!.join(',') });
      const response = await fetch(`/api/topics/composition?${params}`, { credentials: 'include', signal });
      if (!response.ok) throw new Error('Topic composition failed');
      return response.json() as Promise<TopicFeedCompositionCounts>;
    },
    enabled: spaceIds !== undefined,
    staleTime: 60_000,
  });

  return { counts: data ?? null, isLoading: spaceIds === undefined || isLoading };
}

/**
 * A compact summary of every entity type offered by the Topic Explore feed.
 */
export function TopicComposition({
  topicId,
  spaceId,
  spaceIds,
}: {
  topicId: string;
  spaceId: string;
  spaceIds: string[] | undefined;
}) {
  const { counts, isLoading } = useTopicComposition(topicId, spaceId, spaceIds);

  const buckets = React.useMemo<Bucket[]>(() => {
    if (!counts) return [];

    return [...TOPIC_FEED_ENTITY_TYPES]
      .sort((left, right) => left.summaryOrder - right.summaryOrder)
      .map(type => {
        const count = counts.typeCounts[type.id] ?? 0;
        return {
          key: type.id,
          label: count === 1 ? type.label.toLowerCase() : type.pluralLabel,
          count,
          color: type.color,
        };
      })
      .filter(bucket => bucket.count > 0);
  }, [counts]);

  const denominator = buckets.reduce((sum, bucket) => sum + bucket.count, 0);

  if (isLoading) return <Skeleton className="h-[52px] w-full rounded-lg" />;
  if (!counts || denominator === 0 || buckets.length === 0) return null;

  return (
    <section aria-label="What this topic holds">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-grey-01">
        {buckets.map(bucket => (
          <span
            key={bucket.key}
            style={{ backgroundColor: bucket.color, width: `${(100 * bucket.count) / denominator}%` }}
          />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {buckets.map(bucket => (
          <span key={bucket.key} className="inline-flex items-center gap-1.5">
            <span className="size-2 shrink-0 rounded-xs" style={{ backgroundColor: bucket.color }} aria-hidden />
            <Text as="span" variant="metadata" color="grey-04" className="tabular-nums">
              <span className="text-text">{bucket.count}</span> {bucket.label}
            </Text>
          </span>
        ))}
      </div>
    </section>
  );
}

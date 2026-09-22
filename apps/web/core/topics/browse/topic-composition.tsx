'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { ID } from '~/core/id';

import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

type CompositionCounts = { claims: number; debates: number; news: number };

type Bucket = { key: string; label: string; count: number; className: string };

export function useTopicComposition(topicId: string, spaceId: string) {
  const { data, isLoading } = useQuery({
    queryKey: ['topic', 'composition', ID.uuidToHex(topicId), ID.uuidToHex(spaceId)],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ topicId, spaceId });
      const response = await fetch(`/api/topics/composition?${params}`, { credentials: 'include', signal });
      if (!response.ok) throw new Error('Topic composition failed');
      return response.json() as Promise<CompositionCounts>;
    },
    staleTime: 60_000,
  });

  return { counts: data ?? null, isLoading };
}

/**
 * A compact summary of the three entity types that make up the Topic Explore feed.
 */
export function TopicComposition({ topicId, spaceId }: { topicId: string; spaceId: string }) {
  const { counts, isLoading } = useTopicComposition(topicId, spaceId);

  const buckets = React.useMemo<Bucket[]>(() => {
    if (!counts) return [];

    return [
      { key: 'debates', label: 'debates', count: counts.debates, className: 'bg-purple' },
      { key: 'claims', label: 'claims', count: counts.claims, className: 'bg-green' },
      { key: 'news', label: 'news stories', count: counts.news, className: 'bg-orange' },
    ].filter(bucket => bucket.count > 0);
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
            className={bucket.className}
            style={{ width: `${(100 * bucket.count) / denominator}%` }}
          />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {buckets.map(bucket => (
          <span key={bucket.key} className="inline-flex items-center gap-1.5">
            <span className={`size-2 shrink-0 rounded-xs ${bucket.className}`} aria-hidden />
            <Text as="span" variant="metadata" color="grey-04" className="tabular-nums">
              <span className="text-text">{bucket.count}</span> {bucket.label}
            </Text>
          </span>
        ))}
      </div>
    </section>
  );
}

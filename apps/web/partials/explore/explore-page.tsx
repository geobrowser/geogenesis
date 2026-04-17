'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import * as React from 'react';

import type { ExploreFeedItem, ExploreFeedResult, ExploreSort, ExploreTime } from '~/core/explore/fetch-explore-feed';

import { Dropdown } from '~/design-system/dropdown';
import { Skeleton } from '~/design-system/skeleton';

import { ExploreFeedCard } from './explore-feed-card';

function LoadingSkeleton() {
  return (
    <div className="space-y-4 rounded-lg border border-grey-02 p-4">
      <div className="space-y-2">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-20" />
      </div>
      <Skeleton className="h-5 w-48" />
    </div>
  );
}

const SORT: ExploreSort = 'new';

const TIME_OPTIONS: { value: ExploreTime; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'Last month' },
  { value: 'year', label: 'Last year' },
  { value: 'all', label: 'All time' },
];

type SpaceOption = { value: string; label: string };

async function fetchExplorePage(params: {
  sort: ExploreSort;
  time: ExploreTime;
  spaceId: string;
  cursor: string | undefined;
}): Promise<ExploreFeedResult> {
  const sp = new URLSearchParams();
  sp.set('sort', params.sort);
  sp.set('time', params.time);
  sp.set('spaceId', params.spaceId);
  if (params.cursor) sp.set('cursor', params.cursor);
  const res = await fetch(`/api/explore/feed?${sp.toString()}`, { credentials: 'include' });
  if (!res.ok) {
    throw new Error('Explore feed failed');
  }
  return res.json() as Promise<ExploreFeedResult>;
}

export function ExplorePage({
  initialSpaceOptions,
}: {
  initialSpaceOptions: SpaceOption[];
}) {
  const [time, setTime] = React.useState<ExploreTime>('week');
  const [spaceId, setSpaceId] = React.useState<string>('all');

  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage, error } = useInfiniteQuery({
    queryKey: ['explore-feed', SORT, time, spaceId],
    queryFn: ({ pageParam }) =>
      fetchExplorePage({ sort: SORT, time, spaceId, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => last.nextCursor ?? undefined,
    retry: 2,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 8000),
  });

  const sentinelRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: '8000px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const items = React.useMemo(() => {
    const pages = data?.pages ?? [];
    const flat: ExploreFeedItem[] = [];
    for (const p of pages) flat.push(...p.items);
    return flat;
  }, [data?.pages]);

  const timeLabel = TIME_OPTIONS.find(o => o.value === time)?.label ?? time;
  const spaceLabel =
    spaceId === 'all' ? 'Any space' : initialSpaceOptions.find(o => o.value === spaceId)?.label ?? 'Any space';

  return (
    <div className="mx-auto w-full max-w-[880px]">
      <div className="flex flex-wrap items-center gap-3">
        <Dropdown
          align="start"
          trigger={<span>{timeLabel}</span>}
          options={TIME_OPTIONS.map(o => ({
            label: o.label,
            value: o.value,
            disabled: false,
            onClick: () => setTime(o.value),
          }))}
        />
        <div className="ml-auto">
          <Dropdown
            align="end"
            scrollableList
            trigger={<span>{spaceLabel}</span>}
            options={[
              {
                label: 'Any space',
                value: 'all',
                disabled: false,
                onClick: () => setSpaceId('all'),
              },
              ...initialSpaceOptions.map(o => ({
                label: o.label,
                value: o.value,
                disabled: false,
                onClick: () => setSpaceId(o.value),
              })),
            ]}
          />
        </div>
      </div>

      <div className="mt-8">
        {error ? (
          <p className="text-browseMenu text-red-01">Could not load the explore feed.</p>
        ) : isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <LoadingSkeleton key={i} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="text-browseMenu text-grey-04">No entities match these filters yet.</p>
        ) : (
          items.map(item => <ExploreFeedCard key={`${item.entityId}-${item.spaceId}`} item={item} />)
        )}
        <div ref={sentinelRef} className="h-4 w-full" aria-hidden />
        {isFetchingNextPage ? (
          <div className="mt-4 space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <LoadingSkeleton key={i} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

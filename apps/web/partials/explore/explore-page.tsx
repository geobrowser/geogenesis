'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import * as React from 'react';

import type { ExploreFeedItem, ExploreFeedResult, ExploreSort, ExploreTime } from '~/core/explore/fetch-explore-feed';

import { Dropdown } from '~/design-system/dropdown';
import { Text } from '~/design-system/text';

import { ExploreFeedCard } from './explore-feed-card';

const SORT_OPTIONS: { value: ExploreSort; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'top', label: 'Top' },
  { value: 'controversial', label: 'Controversial' },
];

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
  const [sort, setSort] = React.useState<ExploreSort>('top');
  const [time, setTime] = React.useState<ExploreTime>('week');
  const [spaceId, setSpaceId] = React.useState<string>('all');

  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage, error } = useInfiniteQuery({
    queryKey: ['explore-feed', sort, time, spaceId],
    queryFn: ({ pageParam }) =>
      fetchExplorePage({ sort, time, spaceId, cursor: pageParam as string | undefined }),
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
      { rootMargin: '400px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const items = React.useMemo(() => {
    const pages = data?.pages ?? [];
    const flat: ExploreFeedItem[] = [];
    for (const p of pages) flat.push(...p.items);
    if (sort === 'controversial') {
      return [...flat].sort((a, b) => b.commentCount - a.commentCount);
    }
    return flat;
  }, [data?.pages, sort]);

  const sortLabel = SORT_OPTIONS.find(o => o.value === sort)?.label ?? sort;
  const timeLabel = TIME_OPTIONS.find(o => o.value === time)?.label ?? time;
  const spaceLabel =
    spaceId === 'all' ? 'Any space' : initialSpaceOptions.find(o => o.value === spaceId)?.label ?? 'Any space';

  return (
    <div className="mx-auto w-full max-w-[880px]">
      <Text as="h1" variant="largeTitle" className="text-text">
        Explore
      </Text>
      <p className="mt-2 max-w-xl text-browseMenu text-grey-04">
        Discover entities from featured spaces and spaces you belong to. Vote, comment, and join the graph.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Dropdown
          align="start"
          trigger={<span>{sortLabel}</span>}
          options={SORT_OPTIONS.map(o => ({
            label: o.label,
            value: o.value,
            disabled: false,
            onClick: () => setSort(o.value),
          }))}
        />
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
          <p className="text-browseMenu text-grey-04">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-browseMenu text-grey-04">No entities match these filters yet.</p>
        ) : (
          items.map(item => <ExploreFeedCard key={`${item.entityId}-${item.spaceId}`} item={item} />)
        )}
        <div ref={sentinelRef} className="h-4 w-full" aria-hidden />
        {isFetchingNextPage ? <p className="py-4 text-browseMenu text-grey-04">Loading more…</p> : null}
      </div>
    </div>
  );
}

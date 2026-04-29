'use client';

import { useInfiniteQuery } from '@tanstack/react-query';

import * as React from 'react';

import type { ExploreFeedItem, ExploreFeedResult, ExploreSort, ExploreTime } from '~/core/explore/fetch-explore-feed';
import { useSmartAccount } from '~/core/hooks/use-smart-account';

import { Dropdown } from '~/design-system/dropdown';
import { Skeleton } from '~/design-system/skeleton';

import { ExploreFeedCard } from '~/partials/explore/explore-feed-card';

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

const SORT_OPTIONS: { value: ExploreSort; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'top', label: 'Top' },
];

const TIME_OPTIONS: { value: ExploreTime; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'Last month' },
  { value: 'year', label: 'Last year' },
  { value: 'all', label: 'All time' },
];

export type SpaceOption = { value: string; label: string };

type EntityFeedProps = {
  /** REST endpoint this feed fetches from (e.g. `/api/explore/feed` or `/api/activity/feed`). */
  apiEndpoint: string;
  /** Space options for the space dropdown. Required when `lockedSpaceId` is not set. */
  initialSpaceOptions?: SpaceOption[];
  /** When set, the feed is pinned to this space. No space dropdown is rendered. */
  lockedSpaceId?: string;
  /** Initial value for the time dropdown. Defaults to "week". */
  initialTime?: ExploreTime;
  /** Whether to render the time-range dropdown. Defaults to true. */
  showTimeFilter?: boolean;
  /** Whether to render the sort dropdown (New / Top). Defaults to false. */
  showSortFilter?: boolean;
};

async function fetchFeedPage(
  apiEndpoint: string,
  params: {
    sort: ExploreSort;
    time: ExploreTime;
    spaceId: string;
    cursor: string | undefined;
  }
): Promise<ExploreFeedResult> {
  const sp = new URLSearchParams();
  sp.set('sort', params.sort);
  sp.set('time', params.time);
  sp.set('spaceId', params.spaceId);
  if (params.cursor) sp.set('cursor', params.cursor);
  const res = await fetch(`${apiEndpoint}?${sp.toString()}`, { credentials: 'include' });
  if (!res.ok) {
    throw new Error('Feed failed');
  }
  return res.json() as Promise<ExploreFeedResult>;
}

/**
 * Generic entity-feed surface: time + (optional) space dropdowns, auth-aware infinite
 * scroll, skeleton loaders. Explore and activity are both thin wrappers around this.
 */
export function EntityFeed({
  apiEndpoint,
  initialSpaceOptions = [],
  lockedSpaceId,
  initialTime = 'week',
  showTimeFilter = true,
  showSortFilter = false,
}: EntityFeedProps) {
  const [time, setTime] = React.useState<ExploreTime>(initialTime);
  const [sort, setSort] = React.useState<ExploreSort>('new');
  const [selectedSpaceId, setSelectedSpaceId] = React.useState<string>('all');
  const spaceId = lockedSpaceId ?? selectedSpaceId;

  // Key the query on the smart-account address because that hook is what writes the
  // WALLET_ADDRESS cookie the server route reads. Privy's user.id updates earlier
  // (before the cookie is set), which caused refetches to return anonymous data on
  // sign-in and leave "Join space" buttons stuck for a few seconds.
  const { smartAccount } = useSmartAccount();
  const smartAccountAddress = smartAccount?.account.address ?? null;

  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage, error } = useInfiniteQuery({
    queryKey: [apiEndpoint, sort, time, spaceId, smartAccountAddress],
    queryFn: ({ pageParam }) =>
      fetchFeedPage(apiEndpoint, { sort, time, spaceId, cursor: pageParam as string | undefined }),
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
  const sortLabel = SORT_OPTIONS.find(o => o.value === sort)?.label ?? sort;
  const spaceLabel =
    selectedSpaceId === 'all'
      ? 'Any space'
      : (initialSpaceOptions.find(o => o.value === selectedSpaceId)?.label ?? 'Any space');

  return (
    <div className="mx-auto w-full max-w-[880px]">
      {showSortFilter || showTimeFilter || lockedSpaceId == null ? (
        <div className="flex flex-wrap items-center gap-3">
          {showSortFilter ? (
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
          ) : null}
          {showTimeFilter ? (
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
          ) : null}
          {lockedSpaceId == null ? (
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
                    onClick: () => setSelectedSpaceId('all'),
                  },
                  ...initialSpaceOptions.map(o => ({
                    label: o.label,
                    value: o.value,
                    disabled: false,
                    onClick: () => setSelectedSpaceId(o.value),
                  })),
                ]}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={showSortFilter || showTimeFilter || lockedSpaceId == null ? 'mt-8' : '-mt-1'}>
        {error ? (
          <p className="text-browseMenu text-red-01">Could not load the feed.</p>
        ) : isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <LoadingSkeleton key={i} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="text-browseMenu text-grey-04">No entities match these filters yet.</p>
        ) : (
          items.map(item => (
            <ExploreFeedCard
              key={`${item.entityId}-${item.spaceId}`}
              item={item}
              hideSpaceLink={lockedSpaceId != null}
              hideJoinButton={lockedSpaceId != null}
            />
          ))
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

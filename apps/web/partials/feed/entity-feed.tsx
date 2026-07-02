'use client';

import { useInfiniteQuery } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';

import type { ExploreFeedItem, ExploreFeedResult, ExploreSort, ExploreTime } from '~/core/explore/fetch-explore-feed';
import { useSmartAccount } from '~/core/hooks/use-smart-account';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Menu, MenuItem } from '~/design-system/menu';
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

export type EntityFeedFiltersProps = {
  sort: ExploreSort;
  onSortChange: (sort: ExploreSort) => void;
  time: ExploreTime;
  onTimeChange: (time: ExploreTime) => void;
  showSortFilter?: boolean;
  showTimeFilter?: boolean;
  initialSpaceOptions?: SpaceOption[];
  selectedSpaceId?: string;
  onSpaceChange?: (spaceId: string) => void;
  className?: string;
};

export function EntityFeedFilters({
  sort,
  onSortChange,
  time,
  onTimeChange,
  showSortFilter = false,
  showTimeFilter = true,
  initialSpaceOptions = [],
  selectedSpaceId = 'all',
  onSpaceChange,
  className,
}: EntityFeedFiltersProps) {
  const [sortMenuOpen, setSortMenuOpen] = React.useState(false);
  const [timeMenuOpen, setTimeMenuOpen] = React.useState(false);
  const [spaceMenuOpen, setSpaceMenuOpen] = React.useState(false);
  const showSpaceFilter = onSpaceChange != null;

  const timeLabel = TIME_OPTIONS.find(o => o.value === time)?.label ?? time;
  const sortLabel = SORT_OPTIONS.find(o => o.value === sort)?.label ?? sort;
  const spaceLabel =
    selectedSpaceId === 'all'
      ? 'Any space'
      : (initialSpaceOptions.find(o => o.value === selectedSpaceId)?.label ?? 'Any space');

  if (!showSortFilter && !showTimeFilter && !showSpaceFilter) return null;

  return (
    <div className={cx('flex flex-wrap items-center gap-3', className)}>
      {showSortFilter ? (
        <Menu
          asChild
          open={sortMenuOpen}
          onOpenChange={setSortMenuOpen}
          sideOffset={8}
          className="max-w-60 bg-white"
          trigger={
            <button
              type="button"
              className="flex h-6 items-center gap-1.5 rounded border border-grey-02 pr-2 pl-1.5 text-metadata text-grey-04 shadow-button transition-colors duration-150 focus-within:border-text"
            >
              <span>{sortLabel}</span>
              <span className={cx('inline-flex transition-transform duration-200', sortMenuOpen && 'rotate-180')}>
                <ChevronDownSmall color="grey-04" />
              </span>
            </button>
          }
        >
          {SORT_OPTIONS.map(o => (
            <MenuItem
              key={o.value}
              active={o.value === sort}
              onClick={() => {
                onSortChange(o.value);
                setSortMenuOpen(false);
              }}
            >
              {o.label}
            </MenuItem>
          ))}
        </Menu>
      ) : null}
      {showTimeFilter ? (
        <Menu
          asChild
          open={timeMenuOpen}
          onOpenChange={setTimeMenuOpen}
          sideOffset={8}
          className="max-w-60 bg-white"
          trigger={
            <button
              type="button"
              className="flex h-6 items-center gap-1.5 rounded border border-grey-02 pr-2 pl-1.5 text-metadata text-grey-04 shadow-button transition-colors duration-150 focus-within:border-text"
            >
              <span>{timeLabel}</span>
              <span className={cx('inline-flex transition-transform duration-200', timeMenuOpen && 'rotate-180')}>
                <ChevronDownSmall color="grey-04" />
              </span>
            </button>
          }
        >
          {TIME_OPTIONS.map(o => (
            <MenuItem
              key={o.value}
              active={o.value === time}
              onClick={() => {
                onTimeChange(o.value);
                setTimeMenuOpen(false);
              }}
            >
              {o.label}
            </MenuItem>
          ))}
        </Menu>
      ) : null}
      {showSpaceFilter ? (
        <div className="ml-auto">
          <Menu
            asChild
            open={spaceMenuOpen}
            onOpenChange={setSpaceMenuOpen}
            sideOffset={8}
            className="max-w-60 bg-white"
            trigger={
              <button
                type="button"
                className="flex h-6 items-center gap-1.5 rounded border border-grey-02 pr-2 pl-1.5 text-metadata text-grey-04 shadow-button transition-colors duration-150 focus-within:border-text"
              >
                <span>{spaceLabel}</span>
                <span className={cx('inline-flex transition-transform duration-200', spaceMenuOpen && 'rotate-180')}>
                  <ChevronDownSmall color="grey-04" />
                </span>
              </button>
            }
          >
            <MenuItem
              active={selectedSpaceId === 'all'}
              onClick={() => {
                onSpaceChange('all');
                setSpaceMenuOpen(false);
              }}
            >
              Any space
            </MenuItem>
            {initialSpaceOptions.map(o => (
              <MenuItem
                key={o.value}
                active={o.value === selectedSpaceId}
                onClick={() => {
                  onSpaceChange(o.value);
                  setSpaceMenuOpen(false);
                }}
              >
                {o.label}
              </MenuItem>
            ))}
          </Menu>
        </div>
      ) : null}
    </div>
  );
}

type EntityFeedProps = {
  /** REST endpoint this feed fetches from (e.g. `/api/explore/feed` or `/api/activity/feed`). */
  apiEndpoint: string;
  /** Space options for the space dropdown. Required when `lockedSpaceId` is not set. */
  initialSpaceOptions?: SpaceOption[];
  /** When set, the feed is pinned to this space. No space dropdown is rendered. */
  lockedSpaceId?: string;
  /** Restrict the feed to these entity type IDs. Forwarded to the endpoint as a `types` param. */
  typeIds?: readonly string[];
  /** Initial value for the time dropdown. Defaults to "week". */
  initialTime?: ExploreTime;
  /** Initial value for the sort dropdown. Defaults to "new". */
  initialSort?: ExploreSort;
  /** Whether to render the time-range dropdown. Defaults to true. */
  showTimeFilter?: boolean;
  /** Whether to render the sort dropdown (New / Top). Defaults to false. */
  showSortFilter?: boolean;
  /** When false, hides the built-in filter row (use `EntityFeedFilters` externally). Defaults to true. */
  showFilterRow?: boolean;
  /** Controlled sort value. When set with `time`, the feed uses these instead of internal state. */
  sort?: ExploreSort;
  /** Controlled time value. When set with `sort`, the feed uses these instead of internal state. */
  time?: ExploreTime;
  /** When true, skips the outer max-width container so a parent can own layout. */
  embedded?: boolean;
  /** Override the spacing between the filter row and the feed. Defaults to `mt-8`. */
  feedTopSpacingClassName?: string;
  /** When true, renders a divider line between the filter row and the first feed card. */
  dividerBeforeFeed?: boolean;
};

async function fetchFeedPage(
  apiEndpoint: string,
  params: {
    sort: ExploreSort;
    time: ExploreTime;
    spaceId: string;
    cursor: string | undefined;
    types: readonly string[] | undefined;
  }
): Promise<ExploreFeedResult> {
  const sp = new URLSearchParams();
  sp.set('sort', params.sort);
  sp.set('time', params.time);
  sp.set('spaceId', params.spaceId);
  if (params.types && params.types.length > 0) sp.set('types', params.types.join(','));
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
  typeIds,
  initialTime = 'week',
  initialSort = 'new',
  showTimeFilter = true,
  showSortFilter = false,
  showFilterRow = true,
  sort: controlledSort,
  time: controlledTime,
  embedded = false,
  feedTopSpacingClassName,
  dividerBeforeFeed = false,
}: EntityFeedProps) {
  const [internalTime, setInternalTime] = React.useState<ExploreTime>(initialTime);
  const [internalSort, setInternalSort] = React.useState<ExploreSort>(initialSort);
  const time = controlledTime ?? internalTime;
  const sort = controlledSort ?? internalSort;
  const [selectedSpaceId, setSelectedSpaceId] = React.useState<string>('all');
  const spaceId = lockedSpaceId ?? selectedSpaceId;
  const hasBuiltInFilters = showFilterRow && (showSortFilter || showTimeFilter || lockedSpaceId == null);

  // Key the query on the smart-account address because that hook is what writes the
  // WALLET_ADDRESS cookie the server route reads. Privy's user.id updates earlier
  // (before the cookie is set), which caused refetches to return anonymous data on
  // sign-in and leave "Join space" buttons stuck for a few seconds.
  const { smartAccount } = useSmartAccount();
  const smartAccountAddress = smartAccount?.account.address ?? null;

  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage, error } = useInfiniteQuery({
    queryKey: [apiEndpoint, sort, time, spaceId, typeIds?.join(',') ?? '', smartAccountAddress],
    queryFn: ({ pageParam }) =>
      fetchFeedPage(apiEndpoint, { sort, time, spaceId, cursor: pageParam as string | undefined, types: typeIds }),
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

  const content = (
    <>
      {hasBuiltInFilters ? (
        <EntityFeedFilters
          sort={sort}
          onSortChange={setInternalSort}
          time={time}
          onTimeChange={setInternalTime}
          showSortFilter={showSortFilter}
          showTimeFilter={showTimeFilter}
          initialSpaceOptions={initialSpaceOptions}
          selectedSpaceId={selectedSpaceId}
          onSpaceChange={lockedSpaceId == null ? setSelectedSpaceId : undefined}
        />
      ) : null}

      {dividerBeforeFeed ? <hr className="mt-5 border-t border-divider" /> : null}
      <div
        className={
          feedTopSpacingClassName ?? (hasBuiltInFilters ? 'mt-8' : lockedSpaceId != null ? '-mt-1' : undefined)
        }
      >
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
    </>
  );

  if (embedded) return content;

  return <div className="mx-auto w-full max-w-[880px]">{content}</div>;
}

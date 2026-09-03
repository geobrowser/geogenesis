'use client';

import { useInfiniteQuery } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';

import { HubMultiFilterMenu, pickerLabel } from '~/core/debates/matchmaking/hub-filter-menu';
import { useSpaceFilterMenu } from '~/core/debates/matchmaking/use-space-filter-selection';
import { DEFAULT_EXPLORE_TYPE_IDS, EXPLORE_ENTITY_TYPE_IDS } from '~/core/explore/explore-constants';
import {
  EXPLORE_TYPE_FILTER_STORAGE_KEY,
  parseStoredExploreTypeIds,
  toggleExploreTypeId,
} from '~/core/explore/explore-type-filter';
import type { ExploreFeedItem, ExploreFeedResult, ExploreSort, ExploreTime } from '~/core/explore/fetch-explore-feed';
import { useSmartAccount } from '~/core/hooks/use-smart-account';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Menu, MenuItem } from '~/design-system/menu';
import { Skeleton } from '~/design-system/skeleton';

import { ExploreFeedCard } from '~/partials/explore/explore-feed-card';

import { ExploreTypeFilterMenu } from './explore-type-filter-menu';

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
  { value: 'best', label: 'Best' },
  { value: 'new', label: 'New' },
  { value: 'top', label: 'Top' },
];

/**
 * The sorts a time range applies to.
 *
 * "Top" is the only one that asks "of when?" — it ranks by score, so the window is what makes the
 * answer mean anything. "Best" is ranked server-side and "New" is ordered by recency already, so a
 * window over either is a filter the viewer never asked for and can't see they have. The dropdown
 * is hidden for those, and the range leaves the request with it.
 */
const SORTS_WITH_TIME_RANGE: readonly ExploreSort[] = ['top'];

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
  /**
   * The spaces this reader belongs to — joined, or with a membership still pending. The filter
   * opens on whichever of them are on offer, and on nothing at all when there are none, which is
   * the unfiltered feed a reader with no memberships already saw (GEO-2789).
   *
   * Undefined while unknown, which is not the same as empty: empty is a settled answer and takes
   * the fallback, whereas unknown holds the default rather than spending it on a viewer whose
   * memberships had not arrived.
   */
  memberSpaceIds?: string[];
  /** When set, the feed is pinned to this space. No space dropdown is rendered. */
  lockedSpaceId?: string;
  /** Initial value for the time dropdown. Defaults to "week". */
  initialTime?: ExploreTime;
  /** Initial value for the sort dropdown. Defaults to "new". */
  initialSort?: ExploreSort;
  /** Whether to render the time-range dropdown. Defaults to true. */
  showTimeFilter?: boolean;
  /** Whether to render the sort dropdown (Best / New / Top). Defaults to false. */
  showSortFilter?: boolean;
  /** Whether to render the Explore-only, locally persisted type checklist. Defaults to false. */
  showTypeFilter?: boolean;
  /** Override the spacing between the filter row and the feed. Defaults to `mt-8`. */
  feedTopSpacingClassName?: string;
  /** When true, renders a divider line between the filter row and the first feed card. */
  dividerBeforeFeed?: boolean;
  /**
   * Whether a card's entity name opens the side panel instead of navigating (GEO-2757). Explore
   * turns this on. Off for the space activity tab, which is a feed inside a space rather than the
   * cross-space browsing surface the panel was asked for.
   */
  titleOpensSidePanel?: boolean;
};

async function fetchFeedPage(
  apiEndpoint: string,
  params: {
    sort: ExploreSort;
    /** Omitted when the feed's sort has no time range. */
    time: ExploreTime | undefined;
    /** Empty means no space narrowing at all. */
    spaceIds: readonly string[];
    typeIds: readonly string[] | undefined;
    cursor: string | undefined;
  }
): Promise<ExploreFeedResult> {
  const sp = new URLSearchParams();
  sp.set('sort', params.sort);
  // Absent means "no time filter" — see the route's parseTime. Sending nothing is what keeps a
  // hidden range out of the feed it isn't shown for.
  if (params.time !== undefined) sp.set('time', params.time);
  // Omitted rather than sent as `all` when nothing is ticked: the routes read an absent parameter
  // as "no narrowing", which is the same answer with one fewer special string in it.
  if (params.spaceIds.length > 0) sp.set('spaceIds', params.spaceIds.join(','));
  if (params.typeIds !== undefined) sp.set('typeIds', params.typeIds.join(','));
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
  memberSpaceIds,
  lockedSpaceId,
  initialTime = 'week',
  initialSort = 'new',
  showTimeFilter = true,
  showSortFilter = false,
  showTypeFilter = false,
  feedTopSpacingClassName,
  dividerBeforeFeed = false,
  titleOpensSidePanel = false,
}: EntityFeedProps) {
  const [time, setTime] = React.useState<ExploreTime>(initialTime);
  const [sort, setSort] = React.useState<ExploreSort>(initialSort);
  const [spaceIds, setSpaceIds] = React.useState<string[]>([]);
  const [sortMenuOpen, setSortMenuOpen] = React.useState(false);
  const [timeMenuOpen, setTimeMenuOpen] = React.useState(false);
  // Seeded with the default rather than every type, so the first paint is what the effect below
  // will settle on for a reader with nothing stored — the common case. Starting from all twelve
  // showed a wider feed for a frame and then narrowed it.
  const [selectedTypeIds, setSelectedTypeIds] = React.useState<string[]>([...DEFAULT_EXPLORE_TYPE_IDS]);
  const [typeSelectionLoaded, setTypeSelectionLoaded] = React.useState(!showTypeFilter);
  const shouldPersistTypeSelectionRef = React.useRef(false);
  // A locked space is the whole filter and there is no menu to reconcile it with; otherwise it is
  // whatever is ticked, and nothing ticked means every space the reader may see.
  const requestedSpaceIds = React.useMemo(
    () => (lockedSpaceId ? [lockedSpaceId] : spaceIds),
    [lockedSpaceId, spaceIds]
  );
  const spaceIdsKey = requestedSpaceIds.join(',');
  const typeIds =
    showTypeFilter && selectedTypeIds.length !== EXPLORE_ENTITY_TYPE_IDS.length ? selectedTypeIds : undefined;
  const typeIdsKey = typeIds?.join(',') ?? null;
  // One condition behind both the dropdown and the request, so what the viewer can see and what
  // the feed is filtered by cannot drift apart. `time` state is left alone while hidden, so
  // returning to Top restores the range the viewer last picked rather than resetting it.
  const timeRangeApplies = showTimeFilter && SORTS_WITH_TIME_RANGE.includes(sort);
  const requestedTime = timeRangeApplies ? time : undefined;
  const showFilterRow = showSortFilter || timeRangeApplies || lockedSpaceId == null || showTypeFilter;

  React.useEffect(() => {
    if (!showTypeFilter) return;
    setSelectedTypeIds(parseStoredExploreTypeIds(window.localStorage.getItem(EXPLORE_TYPE_FILTER_STORAGE_KEY)));
    setTypeSelectionLoaded(true);
  }, [showTypeFilter]);

  React.useEffect(() => {
    if (!showTypeFilter || !typeSelectionLoaded || !shouldPersistTypeSelectionRef.current) return;
    shouldPersistTypeSelectionRef.current = false;
    window.localStorage.setItem(EXPLORE_TYPE_FILTER_STORAGE_KEY, JSON.stringify(selectedTypeIds));
  }, [selectedTypeIds, showTypeFilter, typeSelectionLoaded]);

  const toggleType = React.useCallback((typeId: string) => {
    shouldPersistTypeSelectionRef.current = true;
    setSelectedTypeIds(current => toggleExploreTypeId(current, typeId));
  }, []);

  const toggleAllTypes = React.useCallback(() => {
    shouldPersistTypeSelectionRef.current = true;
    setSelectedTypeIds(current =>
      current.length === EXPLORE_ENTITY_TYPE_IDS.length ? [] : [...EXPLORE_ENTITY_TYPE_IDS]
    );
  }, []);

  // Key the query on the smart-account address because that hook is what writes the
  // WALLET_ADDRESS cookie the server route reads. Privy's user.id updates earlier
  // (before the cookie is set), which caused refetches to return anonymous data on
  // sign-in and leave "Join space" buttons stuck for a few seconds.
  const { smartAccount } = useSmartAccount();
  const smartAccountAddress = smartAccount?.account.address ?? null;
  // Keyed on what is actually sent: two Best feeds differing only in a hidden range are the same
  // request, and caching them apart would refetch on a change the viewer never made.
  const queryKey = showTypeFilter
    ? [apiEndpoint, sort, requestedTime, spaceIdsKey, typeIdsKey, smartAccountAddress]
    : [apiEndpoint, sort, requestedTime, spaceIdsKey, smartAccountAddress];

  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage, error } = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      fetchFeedPage(apiEndpoint, {
        sort,
        time: requestedTime,
        spaceIds: requestedSpaceIds,
        typeIds,
        cursor: pageParam as string | undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => last.nextCursor ?? undefined,
    retry: 2,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 8000),
    enabled: typeSelectionLoaded,
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

  // The space filter, defaulted and driven the same way the debates side panel's is (GEO-2789), by
  // the same hook — so the two surfaces cannot drift on what "your spaces" means or on what a tick
  // does. `count` is left off: the feed has no per-space totals to offer, and the menu draws a row
  // without one rather than a zero.
  const offeredSpaces = React.useMemo(
    () => initialSpaceOptions.map(option => ({ id: option.value, name: option.label, count: 0 })),
    [initialSpaceOptions]
  );

  const memberSpaces = React.useMemo(
    () => (memberSpaceIds === undefined ? null : new Set(memberSpaceIds)),
    [memberSpaceIds]
  );

  const { onSpaceToggle, onSpacesClear } = useSpaceFilterMenu({
    offeredSpaces,
    spaceIds,
    setSpaceIds,
    memberSpaceIds: memberSpaces,
    // The options are a server prop rather than a query, so they are never half-arrived here.
    pending: false,
  });
  // The hook's `facetSpaces` is deliberately unused. It keeps a *selected* option visible after a
  // count drops it and orders by that count — neither of which applies to a fixed server-rendered
  // list, where ordering by a count these rows do not have would replace featured-first with
  // alphabetical-by-id. `initialSpaceOptions` is already a `HubFilterOption`, so the menu takes it
  // as it stands.

  const timeLabel = TIME_OPTIONS.find(o => o.value === time)?.label ?? time;
  const sortLabel = SORT_OPTIONS.find(o => o.value === sort)?.label ?? sort;
  const spaceLabel = pickerLabel(
    spaceIds.length,
    'Any space',
    () => initialSpaceOptions.find(option => option.value === spaceIds[0])?.label ?? 'Any space',
    count => `${count} spaces`
  );

  return (
    <div className="mx-auto w-full max-w-[880px]">
      {showFilterRow ? (
        <div className="flex flex-wrap items-center gap-3">
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
                  aria-label={`Sort: ${sortLabel}`}
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
                    setSort(o.value);
                    setSortMenuOpen(false);
                  }}
                >
                  {o.label}
                </MenuItem>
              ))}
            </Menu>
          ) : null}
          {timeRangeApplies ? (
            <Menu
              asChild
              open={timeMenuOpen}
              onOpenChange={setTimeMenuOpen}
              sideOffset={8}
              className="max-w-60 bg-white"
              trigger={
                <button
                  type="button"
                  aria-label={`Time range: ${timeLabel}`}
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
                    setTime(o.value);
                    setTimeMenuOpen(false);
                  }}
                >
                  {o.label}
                </MenuItem>
              ))}
            </Menu>
          ) : null}
          {lockedSpaceId == null || showTypeFilter ? (
            <div className="ml-auto flex items-center gap-3">
              {lockedSpaceId == null ? (
                <HubMultiFilterMenu
                  label={spaceLabel}
                  options={initialSpaceOptions}
                  values={spaceIds}
                  onToggle={onSpaceToggle}
                  onClear={onSpacesClear}
                  clearLabel="Any space"
                  showImages={false}
                />
              ) : null}
              {showTypeFilter ? (
                <ExploreTypeFilterMenu
                  selectedTypeIds={selectedTypeIds}
                  onToggleType={toggleType}
                  onToggleAll={toggleAllTypes}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {dividerBeforeFeed ? <hr className="mt-5 border-t border-divider" /> : null}
      <div className={feedTopSpacingClassName ?? (showFilterRow ? 'mt-8' : '-mt-1')}>
        {error ? (
          <p className="text-browseMenu text-red-01">Could not load the feed.</p>
        ) : isLoading || !typeSelectionLoaded ? (
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
              titleOpensSidePanel={titleOpensSidePanel}
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

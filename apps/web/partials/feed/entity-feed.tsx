'use client';

import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';

import { type HubFilterOption, HubMultiFilterMenu, pickerLabel } from '~/core/debates/matchmaking/hub-filter-menu';
import { keepSelectableTopics, orderFacetOptions } from '~/core/debates/matchmaking/topic-facets';
import type { ExploreFeedItem, ExploreFeedResult, ExploreSort, ExploreTime } from '~/core/explore/fetch-explore-feed';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { normId } from '~/core/utils/norm-id';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Menu, MenuItem } from '~/design-system/menu';
import { Skeleton } from '~/design-system/skeleton';

import type { ClaimCardVariant } from '~/partials/explore/claim-explore-feed-card';
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
 *
 * There is now a performance reason not to widen this without measuring, on top of the product one:
 * Explore's debate-tag clause roughly doubles a query that also carries a `createdAt` window, and
 * Top is unaffected only because its own window happens not to hit that path. See
 * `explore-debate-tag-filter` for the numbers.
 */
const SORTS_WITH_TIME_RANGE: readonly ExploreSort[] = ['top'];

const TIME_OPTIONS: { value: ExploreTime; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'Last month' },
  { value: 'year', label: 'Last year' },
  { value: 'all', label: 'All time' },
];

type EntityFeedProps = {
  /** REST endpoint this feed fetches from (e.g. `/api/explore/feed` or `/api/activity/feed`). */
  apiEndpoint: string;
  /** When set, the feed is pinned to this space. */
  lockedSpaceId?: string;
  /** Initial value for the time dropdown. Defaults to "week". */
  initialTime?: ExploreTime;
  /** Initial value for the sort dropdown. Defaults to "new". */
  initialSort?: ExploreSort;
  /** Whether to render the time-range dropdown. Defaults to true. */
  showTimeFilter?: boolean;
  /** Whether to render the sort dropdown (Best / New / Top). Defaults to false. */
  showSortFilter?: boolean;
  /** Whether to render the type checklist. Defaults to false. */
  showTypeFilter?: boolean;
  /** Initial type selection. */
  initialTypeIds?: readonly string[];
  /** Type checklist options. */
  typeOptions?: readonly { id: string; label: string }[];
  /** Counts for this contextual feed's unfiltered population, shown beside each type. */
  typeCounts?: readonly { id: string; count: number }[];
  /** Whether contextual type counts are still loading. */
  typeCountsPending?: boolean;
  /** Start contextual feeds on only the types whose population count is non-zero. */
  selectTypesWithResultsByDefault?: boolean;
  /** Optional Topic facet shown beside the type picker. */
  topicOptions?: HubFilterOption<string>[];
  /** Optional endpoint that counts and prunes Topic options against this feed's current filters. */
  topicFacetEndpoint?: string;
  /** Keep the Topic picker visible while its options load or when the default list is empty. */
  showTopicFilter?: boolean;
  /** Stable query parameters owned by a contextual feed, such as the page Topic and route space. */
  fixedParams?: Record<string, string>;
  /** Optional bound for contextual AND-composed Topic selections. */
  maxTopicSelections?: number;
  /** Override the spacing between the filter row and the feed. Defaults to `mt-8`. */
  feedTopSpacingClassName?: string;
  /** When true, renders a divider line between the filter row and the first feed card. */
  dividerBeforeFeed?: boolean;
  /** Presentation used for Claim rows; the main Explore route uses the mobile panel variant. */
  claimCardVariant?: ClaimCardVariant;
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
    topicIds: readonly string[];
    fixedParams: Record<string, string>;
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
  if (params.topicIds.length > 0) sp.set('topicIds', params.topicIds.join(','));
  for (const [key, value] of Object.entries(params.fixedParams)) sp.set(key, value);
  if (params.cursor) sp.set('cursor', params.cursor);
  const res = await fetch(`${apiEndpoint}?${sp.toString()}`, { credentials: 'include' });
  if (!res.ok) {
    throw new Error('Feed failed');
  }
  return res.json() as Promise<ExploreFeedResult>;
}

type TopicFacetResult = { topics: Array<{ id: string; name: string | null; count: number }> };

async function fetchTopicFacets(
  endpoint: string,
  params: {
    selectedTopicIds: readonly string[];
    typeIds: readonly string[] | undefined;
    fixedParams: Record<string, string>;
    signal?: AbortSignal;
  }
): Promise<TopicFacetResult> {
  const response = await fetch(endpoint, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      selectedTopicIds: params.selectedTopicIds,
      typeIds: params.typeIds,
      fixedParams: params.fixedParams,
    }),
    signal: params.signal,
  });
  if (!response.ok) throw new Error('Topic facets failed');
  return response.json() as Promise<TopicFacetResult>;
}

/**
 * Generic entity-feed surface: sort, time, type and topic filters, auth-aware infinite scroll,
 * skeleton loaders. Explore, activity and Topic feeds are thin wrappers around this.
 */
export function EntityFeed({
  apiEndpoint,
  lockedSpaceId,
  initialTime = 'week',
  initialSort = 'new',
  showTimeFilter = true,
  showSortFilter = false,
  showTypeFilter = false,
  initialTypeIds = [],
  typeOptions = [],
  typeCounts,
  typeCountsPending = false,
  selectTypesWithResultsByDefault = false,
  topicOptions = [],
  topicFacetEndpoint,
  showTopicFilter = false,
  fixedParams = {},
  maxTopicSelections,
  feedTopSpacingClassName,
  dividerBeforeFeed = false,
  titleOpensSidePanel = false,
  claimCardVariant = 'feed',
}: EntityFeedProps) {
  const [time, setTime] = React.useState<ExploreTime>(initialTime);
  const [sort, setSort] = React.useState<ExploreSort>(initialSort);
  const [sortMenuOpen, setSortMenuOpen] = React.useState(false);
  const [timeMenuOpen, setTimeMenuOpen] = React.useState(false);
  const [selectedTypeIds, setSelectedTypeIds] = React.useState<string[]>([...initialTypeIds]);
  const [selectedTopicIds, setSelectedTopicIds] = React.useState<string[]>([]);
  const typeSelectionTouchedRef = React.useRef(false);
  const contextualTypeDefaultAppliedRef = React.useRef(false);
  // A locked space is the whole filter; otherwise every space the reader may see.
  const requestedSpaceIds = React.useMemo(() => (lockedSpaceId ? [lockedSpaceId] : []), [lockedSpaceId]);
  const spaceIdsKey = requestedSpaceIds.join(',');
  const nonEmptyTypeIds = React.useMemo(() => {
    if (!typeCounts || typeCountsPending) return null;
    const countById = new Map(typeCounts.map(type => [normId(type.id), type.count]));
    return typeOptions.filter(type => (countById.get(normId(type.id)) ?? 0) > 0).map(type => type.id);
  }, [typeCounts, typeCountsPending, typeOptions]);
  const visibleTypeOptions = React.useMemo(() => {
    if (!selectTypesWithResultsByDefault || !nonEmptyTypeIds) return typeOptions;
    const nonEmptyTypeIdSet = new Set(nonEmptyTypeIds.map(normId));
    return typeOptions.filter(type => nonEmptyTypeIdSet.has(normId(type.id)));
  }, [nonEmptyTypeIds, selectTypesWithResultsByDefault, typeOptions]);
  const selectedTypeIdSet = React.useMemo(() => new Set(selectedTypeIds.map(normId)), [selectedTypeIds]);
  const visibleSelectedTypeIds = React.useMemo(
    () => visibleTypeOptions.filter(type => selectedTypeIdSet.has(normId(type.id))).map(type => type.id),
    [selectedTypeIdSet, visibleTypeOptions]
  );
  const selectsWholePopulation = React.useMemo(() => {
    if (selectedTypeIds.length === typeOptions.length) return true;
    if (!selectTypesWithResultsByDefault || !nonEmptyTypeIds || nonEmptyTypeIds.length === 0) return false;
    return (
      selectedTypeIds.length === nonEmptyTypeIds.length &&
      nonEmptyTypeIds.every(typeId => selectedTypeIdSet.has(normId(typeId)))
    );
  }, [nonEmptyTypeIds, selectTypesWithResultsByDefault, selectedTypeIdSet, selectedTypeIds.length, typeOptions.length]);
  const typeIds = showTypeFilter && !selectsWholePopulation ? selectedTypeIds : undefined;
  const typeIdsKey = typeIds?.join(',') ?? null;
  const topicIdsKey = selectedTopicIds.join(',');
  const fixedParamsKey = Object.entries(fixedParams)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${value}`)
    .join('|');
  const topicFacets = useQuery({
    queryKey: [
      'entity-feed-topic-facets',
      topicFacetEndpoint ?? null,
      topicIdsKey,
      showTypeFilter ? typeIdsKey : null,
      fixedParamsKey,
    ],
    enabled: Boolean(topicFacetEndpoint),
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      fetchTopicFacets(topicFacetEndpoint!, {
        selectedTopicIds,
        typeIds: showTypeFilter ? typeIds : undefined,
        fixedParams,
        signal,
      }),
    staleTime: 60_000,
  });
  const topicCountsPending = Boolean(topicFacetEndpoint) && (topicFacets.isLoading || topicFacets.isPlaceholderData);
  const availableTopicOptions = React.useMemo<HubFilterOption<string>[]>(() => {
    const options = topicFacetEndpoint
      ? orderFacetOptions(topicFacets.data?.topics ?? [], selectedTopicIds).map(topic => ({
          value: topic.id,
          label: topic.name?.trim() || 'Topic',
          count: topic.count,
        }))
      : topicOptions;
    return options;
  }, [selectedTopicIds, topicFacetEndpoint, topicFacets.data?.topics, topicOptions]);

  React.useEffect(() => {
    if (!topicFacetEndpoint || topicFacets.isPlaceholderData || topicFacets.error || !topicFacets.data) return;
    setSelectedTopicIds(current => keepSelectableTopics(current, topicFacets.data.topics, true));
  }, [topicFacetEndpoint, topicFacets.data, topicFacets.error, topicFacets.isPlaceholderData]);
  // One condition behind both the dropdown and the request, so what the viewer can see and what
  // the feed is filtered by cannot drift apart. `time` state is left alone while hidden, so
  // returning to Top restores the range the viewer last picked rather than resetting it.
  const timeRangeApplies = showTimeFilter && SORTS_WITH_TIME_RANGE.includes(sort);
  const requestedTime = timeRangeApplies ? time : undefined;
  const topicFilterVisible = showTopicFilter || availableTopicOptions.length > 0;
  const showFilterRow = showSortFilter || timeRangeApplies || showTypeFilter || topicFilterVisible;

  React.useEffect(() => {
    if (
      !showTypeFilter ||
      !selectTypesWithResultsByDefault ||
      !nonEmptyTypeIds ||
      contextualTypeDefaultAppliedRef.current
    ) {
      return;
    }
    contextualTypeDefaultAppliedRef.current = true;
    if (!typeSelectionTouchedRef.current) setSelectedTypeIds(nonEmptyTypeIds);
  }, [nonEmptyTypeIds, selectTypesWithResultsByDefault, showTypeFilter]);

  const toggleType = React.useCallback(
    (typeId: string) => {
      typeSelectionTouchedRef.current = true;
      setSelectedTypeIds(current => {
        const selected = new Set(current);
        if (selected.has(typeId)) selected.delete(typeId);
        else selected.add(typeId);
        return typeOptions.map(type => type.id).filter(id => selected.has(id));
      });
    },
    [typeOptions]
  );

  const toggleAllTypes = React.useCallback(() => {
    typeSelectionTouchedRef.current = true;
    setSelectedTypeIds(current => {
      const currentSet = new Set(current.map(normId));
      const allVisibleSelected =
        visibleTypeOptions.length > 0 && visibleTypeOptions.every(type => currentSet.has(normId(type.id)));
      return allVisibleSelected ? [] : visibleTypeOptions.map(type => type.id);
    });
  }, [visibleTypeOptions]);

  const toggleTopic = React.useCallback(
    (topicId: string) => {
      setSelectedTopicIds(current => {
        if (current.includes(topicId)) return current.filter(id => id !== topicId);
        if (maxTopicSelections !== undefined && current.length >= maxTopicSelections) return current;
        return [...current, topicId];
      });
    },
    [maxTopicSelections]
  );

  // Key the query on the smart-account address because that hook is what writes the
  // WALLET_ADDRESS cookie the server route reads. Privy's user.id updates earlier
  // (before the cookie is set), which caused refetches to return anonymous data on
  // sign-in and leave "Join space" buttons stuck for a few seconds.
  const { smartAccount } = useSmartAccount();
  const smartAccountAddress = smartAccount?.account.address ?? null;
  // Keyed on what is actually sent: two Best feeds differing only in a hidden range are the same
  // request, and caching them apart would refetch on a change the viewer never made.
  const queryKey = [
    apiEndpoint,
    sort,
    requestedTime,
    spaceIdsKey,
    showTypeFilter ? typeIdsKey : null,
    topicIdsKey,
    fixedParamsKey,
    smartAccountAddress,
  ];

  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage, error } = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      fetchFeedPage(apiEndpoint, {
        sort,
        time: requestedTime,
        spaceIds: requestedSpaceIds,
        typeIds,
        topicIds: selectedTopicIds,
        fixedParams,
        cursor: pageParam as string | undefined,
      }),
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
  const topicLabel = pickerLabel(
    selectedTopicIds.length,
    'Any topic',
    () =>
      topicFacets.data?.topics.find(topic => normId(topic.id) === normId(selectedTopicIds[0]))?.name ??
      topicOptions.find(option => normId(option.value) === normId(selectedTopicIds[0]))?.label ??
      availableTopicOptions.find(option => normId(option.value) === normId(selectedTopicIds[0]))?.label ??
      '1 topic',
    count => `${count} topics`
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
          {showTypeFilter || topicFilterVisible ? (
            <div className="ml-auto flex items-center gap-3">
              {showTypeFilter ? (
                <ExploreTypeFilterMenu
                  selectedTypeIds={visibleSelectedTypeIds}
                  typeOptions={visibleTypeOptions}
                  typeCounts={typeCounts}
                  countsPending={typeCountsPending}
                  onToggleType={toggleType}
                  onToggleAll={toggleAllTypes}
                />
              ) : null}
              {topicFilterVisible ? (
                <HubMultiFilterMenu
                  label={topicLabel}
                  options={availableTopicOptions}
                  values={selectedTopicIds}
                  onToggle={toggleTopic}
                  onClear={() => setSelectedTopicIds([])}
                  clearLabel="Any topic"
                  showImages={false}
                  searchPlaceholder="Search topics"
                  searchEmptyLabel="No topics found"
                  countsPending={topicCountsPending}
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
        ) : isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <LoadingSkeleton key={i} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="text-browseMenu text-grey-04">No entities match these filters yet.</p>
        ) : (
          items.map((item, index) => (
            <ExploreFeedCard
              itemPosition={index + 1}
              key={`${item.entityId}-${item.spaceId}`}
              item={item}
              hideSpaceLink={lockedSpaceId != null}
              hideJoinButton={lockedSpaceId != null}
              titleOpensSidePanel={titleOpensSidePanel}
              claimCardVariant={claimCardVariant}
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

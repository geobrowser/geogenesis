'use client';

import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';

import { type HubFilterOption, HubMultiFilterMenu, pickerLabel } from '~/core/debates/matchmaking/hub-filter-menu';
import { keepSelectableTopics, orderFacetOptions } from '~/core/debates/matchmaking/topic-facets';
import { memberSpaceSelection, useSpaceFilterMenu } from '~/core/debates/matchmaking/use-space-filter-selection';
import { useClaimSpaceAllowlist } from '~/core/debates/use-claim-space-allowlist';
import { DEFAULT_EXPLORE_TYPE_IDS, EXPLORE_ENTITY_TYPES } from '~/core/explore/explore-constants';
import { EXPLORE_TYPE_FILTER_STORAGE_KEY, parseStoredExploreTypeIds } from '~/core/explore/explore-type-filter';
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
   * Undefined means the caller has no membership data to give — the activity feed, which pins its
   * own space and draws no menu. There is nothing to wait for in that case, so it reads as the
   * fallback rather than holding the feed: every space this reader may see.
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
  /** Whether the space picker is shown and sent. Topic feeds use their own curated scope. */
  showSpaceFilter?: boolean;
  /** Initial type selection. Explore defaults to its three primary types; Topic feeds start broad. */
  initialTypeIds?: readonly string[];
  /** Type checklist options. Defaults to the standard Explore set. */
  typeOptions?: readonly { id: string; label: string }[];
  /** Restore and save the Explore route's type choice. Disable for contextual feeds. */
  persistTypeSelection?: boolean;
  /** Optional Topic facet shown beside the type picker. */
  topicOptions?: HubFilterOption<string>[];
  /** Optional endpoint that counts and prunes Topic options against this feed's current filters. */
  topicFacetEndpoint?: string;
  /** Keep the Topic picker visible while its options load or when the default list is empty. */
  showTopicFilter?: boolean;
  /** Optional search state for a dynamic Topic picker. */
  topicSearch?: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    isLoading?: boolean;
    emptyLabel?: string;
  };
  /** Stable query parameters owned by a contextual feed, such as the page Topic and route space. */
  fixedParams?: Record<string, string>;
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
  showSpaceFilter = true,
  initialTypeIds = DEFAULT_EXPLORE_TYPE_IDS,
  typeOptions = EXPLORE_ENTITY_TYPES,
  persistTypeSelection = true,
  topicOptions = [],
  topicFacetEndpoint,
  showTopicFilter = false,
  topicSearch,
  fixedParams = {},
  feedTopSpacingClassName,
  dividerBeforeFeed = false,
  titleOpensSidePanel = false,
  claimCardVariant = 'feed',
}: EntityFeedProps) {
  const [time, setTime] = React.useState<ExploreTime>(initialTime);
  const [sort, setSort] = React.useState<ExploreSort>(initialSort);
  // Seeded on the first render rather than by the hook's effect. Both sides are server props on
  // this surface, so the answer is already in hand — and starting empty would subscribe the feed to
  // the unfiltered query, fire that request, and only then narrow, showing the wide feed in
  // between. The hook's effect still runs and arrives at the same answer, which it then skips.
  const [spaceIds, setSpaceIds] = React.useState<string[]>(() =>
    memberSpaceSelection(
      initialSpaceOptions.map(option => option.value),
      memberSpaceIds === undefined ? null : new Set(memberSpaceIds)
    )
  );
  const [sortMenuOpen, setSortMenuOpen] = React.useState(false);
  const [timeMenuOpen, setTimeMenuOpen] = React.useState(false);
  // Seeded with the default rather than every type, so the first paint is what the effect below
  // will settle on for a reader with nothing stored — the common case. Starting from all twelve
  // showed a wider feed for a frame and then narrowed it.
  const [selectedTypeIds, setSelectedTypeIds] = React.useState<string[]>([...initialTypeIds]);
  const [selectedTopicIds, setSelectedTopicIds] = React.useState<string[]>([]);
  const [typeSelectionLoaded, setTypeSelectionLoaded] = React.useState(!showTypeFilter || !persistTypeSelection);
  const shouldPersistTypeSelectionRef = React.useRef(false);
  // A locked space is the whole filter and there is no menu to reconcile it with; otherwise it is
  // whatever is ticked, and nothing ticked means every space the reader may see.
  const requestedSpaceIds = React.useMemo(
    () => (showSpaceFilter ? (lockedSpaceId ? [lockedSpaceId] : spaceIds) : []),
    [lockedSpaceId, showSpaceFilter, spaceIds]
  );
  const spaceIdsKey = requestedSpaceIds.join(',');
  const typeIds = showTypeFilter && selectedTypeIds.length !== typeOptions.length ? selectedTypeIds : undefined;
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
    enabled: Boolean(topicFacetEndpoint && typeSelectionLoaded),
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
    const query = topicSearch?.value.trim().toLocaleLowerCase();
    return query ? options.filter(option => option.label.toLocaleLowerCase().includes(query)) : options;
  }, [selectedTopicIds, topicFacetEndpoint, topicFacets.data?.topics, topicOptions, topicSearch?.value]);

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
  const showFilterRow =
    showSortFilter ||
    timeRangeApplies ||
    (showSpaceFilter && lockedSpaceId == null) ||
    showTypeFilter ||
    topicFilterVisible;

  React.useEffect(() => {
    if (!showTypeFilter || !persistTypeSelection) return;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(EXPLORE_TYPE_FILTER_STORAGE_KEY);
    } catch {
      // Site data blocked — the filter starts at its default rather than the feed failing to mount.
    }
    setSelectedTypeIds(parseStoredExploreTypeIds(stored));
    setTypeSelectionLoaded(true);
  }, [persistTypeSelection, showTypeFilter]);

  React.useEffect(() => {
    if (!showTypeFilter || !persistTypeSelection || !typeSelectionLoaded || !shouldPersistTypeSelectionRef.current)
      return;
    shouldPersistTypeSelectionRef.current = false;
    try {
      window.localStorage.setItem(EXPLORE_TYPE_FILTER_STORAGE_KEY, JSON.stringify(selectedTypeIds));
    } catch {
      // Quota or blocked site data — the choice holds for this session, it just won't be restored.
    }
  }, [persistTypeSelection, selectedTypeIds, showTypeFilter, typeSelectionLoaded]);

  const toggleType = React.useCallback(
    (typeId: string) => {
      shouldPersistTypeSelectionRef.current = true;
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
    shouldPersistTypeSelectionRef.current = true;
    setSelectedTypeIds(current => (current.length === typeOptions.length ? [] : typeOptions.map(type => type.id)));
  }, [typeOptions]);

  const toggleTopic = React.useCallback((topicId: string) => {
    setSelectedTopicIds(current =>
      current.includes(topicId) ? current.filter(id => id !== topicId) : [...current, topicId]
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

  // The prop is what the viewer's spaces were when the page was *rendered*, which for someone who
  // has just signed up is before they had any: their personal space takes 30s-3min to land and the
  // membership requests behind their sign-up picks are fired after it, so the server answers with
  // an empty set and the filter opens on nothing — the unfiltered feed, over every featured space
  // (GEO-2815). Nothing then moved it, because a server prop cannot: the requests landed a minute
  // later and only a hard refresh re-rendered the page that computes it.
  //
  // So the prop seeds the first paint and the live query takes over the moment it answers. Same
  // value, same helper, same sidebar payload the server read — this is the client's copy of it,
  // shared with the debates surfaces rather than fetched again, and it refreshes when a membership
  // request is published (see `requestSpaceMembership`).
  //
  // `useMemberSpaceDefault` is already written for a late answer: its seed is spent on a match, so
  // an empty first answer leaves it armed and the real one applies when it arrives. A viewer who
  // touches the filter before then forfeits it, which is the behaviour that makes this a default
  // rather than a policy.
  const {
    memberSpaceIds: liveMemberSpaceIds,
    isSettlingMemberships,
    isLoading: memberSpacesLoading,
  } = useClaimSpaceAllowlist(showSpaceFilter && lockedSpaceId == null);

  // The union of the two, not the live one in place of the prop. Neither is reliably the fresher:
  // the prop was computed during *this* render of the page, while the live value can be a cache
  // entry up to a minute old that the sidebar filled on another route — so a reader who joined a
  // space and navigated here would have had the space in the prop and missing from the cache, and
  // preferring the cache would seed the default without it. Both lists answer "spaces that are
  // mine", so a union can only be too generous, and too generous means one extra box ticked in a
  // menu the reader can edit.
  const memberSpaces = React.useMemo(() => {
    if (liveMemberSpaceIds === null && memberSpaceIds === undefined) return null;
    return new Set([...(liveMemberSpaceIds ?? []), ...(memberSpaceIds ?? [])]);
  }, [liveMemberSpaceIds, memberSpaceIds]);

  const { onSpaceToggle, onSpacesClear } = useSpaceFilterMenu({
    offeredSpaces,
    spaceIds,
    setSpaceIds,
    memberSpaceIds: memberSpaces,
    // The *options* are a server prop and are never half-arrived. The viewer's spaces are, and the
    // seed is spent on the first non-empty match — so reporting anything but the truth here spends
    // it on a fraction of the answer. Sign-up sends one membership proposal per picked space and
    // they land seconds apart: a reader who picked three spaces would otherwise be pinned to
    // whichever indexed first, with the other two silently dropped.
    pending: memberSpacesLoading || isSettlingMemberships,
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
          {(showSpaceFilter && lockedSpaceId == null) || showTypeFilter || topicFilterVisible ? (
            <div className="ml-auto flex items-center gap-3">
              {showSpaceFilter && lockedSpaceId == null ? (
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
                  typeOptions={typeOptions}
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
                  search={
                    topicSearch
                      ? {
                          ...topicSearch,
                          isLoading: topicSearch.isLoading || (Boolean(topicFacetEndpoint) && topicFacets.isLoading),
                        }
                      : undefined
                  }
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

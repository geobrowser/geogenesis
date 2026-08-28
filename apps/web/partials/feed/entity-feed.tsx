'use client';

import { useInfiniteQuery } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';

import { EXPLORE_ENTITY_TYPE_IDS } from '~/core/explore/explore-constants';
import {
  EXPLORE_TYPE_FILTER_STORAGE_KEY,
  parseStoredExploreTypeIds,
  toggleExploreTypeId,
} from '~/core/explore/explore-type-filter';
import type { ExploreFeedItem, ExploreFeedResult, ExploreSort, ExploreTime } from '~/core/explore/fetch-explore-feed';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { resolveEntityResponseKind } from '~/core/responses/entity-response';
import {
  ClaimResponseBatchBoundary,
  type CrossSpaceClaimResponseTarget,
  useClaimResponseSummaryBatchAcrossSpaces,
} from '~/core/responses/use-claim-response-summaries';
import { useQueryEntities } from '~/core/sync/use-store';
import { resolveEntitySpaceId } from '~/core/utils/space/entity-home-space';

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
};

async function fetchFeedPage(
  apiEndpoint: string,
  params: {
    sort: ExploreSort;
    /** Omitted when the feed's sort has no time range. */
    time: ExploreTime | undefined;
    spaceId: string;
    typeIds: readonly string[] | undefined;
    cursor: string | undefined;
  }
): Promise<ExploreFeedResult> {
  const sp = new URLSearchParams();
  sp.set('sort', params.sort);
  // Absent means "no time filter" — see the route's parseTime. Sending nothing is what keeps a
  // hidden range out of the feed it isn't shown for.
  if (params.time !== undefined) sp.set('time', params.time);
  sp.set('spaceId', params.spaceId);
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
  lockedSpaceId,
  initialTime = 'week',
  initialSort = 'new',
  showTimeFilter = true,
  showSortFilter = false,
  showTypeFilter = false,
  feedTopSpacingClassName,
  dividerBeforeFeed = false,
}: EntityFeedProps) {
  const [time, setTime] = React.useState<ExploreTime>(initialTime);
  const [sort, setSort] = React.useState<ExploreSort>(initialSort);
  const [selectedSpaceId, setSelectedSpaceId] = React.useState<string>('all');
  const [sortMenuOpen, setSortMenuOpen] = React.useState(false);
  const [timeMenuOpen, setTimeMenuOpen] = React.useState(false);
  const [spaceMenuOpen, setSpaceMenuOpen] = React.useState(false);
  const [selectedTypeIds, setSelectedTypeIds] = React.useState<string[]>([...EXPLORE_ENTITY_TYPE_IDS]);
  const [typeSelectionLoaded, setTypeSelectionLoaded] = React.useState(!showTypeFilter);
  const shouldPersistTypeSelectionRef = React.useRef(false);
  const spaceId = lockedSpaceId ?? selectedSpaceId;
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
    ? [apiEndpoint, sort, requestedTime, spaceId, typeIdsKey, smartAccountAddress]
    : [apiEndpoint, sort, requestedTime, spaceId, smartAccountAddress];

  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage, error } = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      fetchFeedPage(apiEndpoint, {
        sort,
        time: requestedTime,
        spaceId,
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

  /**
   * One batched response lookup for the whole feed, instead of two queries per row.
   *
   * `EntityVoteButtons` and `ClaimVoterAvatars` each fetch their own counts and responders, so a
   * page of 66 rows cost 125 requests and kept the network busy long after first paint. They
   * already stand down when a `ClaimResponseBatchBoundary` says the data is managed — the Claims
   * tab has done this since GEO-2599 — but nothing set that up for a feed.
   *
   * `responseKind` is read from the same store entity the buttons read it from, so the keys the
   * batch writes are the keys they look for. Before an entity hydrates it resolves to the default,
   * the row falls back to its own fetch as it does today, and the target list changes once the
   * store fills — `keepPreviousData` in the hook keeps the visible positions through that.
   */
  const feedEntityIds = React.useMemo(() => [...new Set(items.map(item => item.entityId))], [items]);
  const { entities: feedEntities } = useQueryEntities({
    where: { id: { in: feedEntityIds } },
    first: feedEntityIds.length,
    enabled: feedEntityIds.length > 0,
  });
  const feedEntitiesById = React.useMemo(
    () => new Map((feedEntities ?? []).map(entity => [entity.id, entity])),
    [feedEntities]
  );
  const responseTargets = React.useMemo<CrossSpaceClaimResponseTarget[]>(
    () =>
      items.flatMap(item => {
        const entity = feedEntitiesById.get(item.entityId);
        // Nothing is known about this row yet, so anything derived here would be a guess. Emitting
        // no target leaves the row to its own fetch rather than writing a key it will not read.
        if (!entity) return [];

        /**
         * Derived with the same two functions the button uses, not an approximation of them.
         *
         * `EntityVoteButtons` resolves its space with `resolveEntitySpaceId` — a row listing an
         * entity that lives elsewhere reads that space's votes (GEO-2660) — and its kind with
         * `resolveEntityResponseKind`, which returns `curation` for everything that is not a claim.
         * Computing either differently writes cache keys the button never looks at, and because the
         * boundary disables its own query, the row would render zero votes instead of falling back.
         */
        const spaceId = resolveEntitySpaceId(entity, item.spaceId);
        return [{ entityId: item.entityId, spaceId, responseKind: resolveEntityResponseKind(entity, spaceId) }];
      }),
    [items, feedEntitiesById]
  );
  const responseBatch = useClaimResponseSummaryBatchAcrossSpaces({
    targets: responseTargets,
    enabled: responseTargets.length > 0,
  });
  const responseBatchReady = responseTargets.length === 0 || responseBatch.isSuccess;
  /**
   * A failed batch hands the rows back rather than holding them.
   *
   * `EntityVoteButtons` renders a skeleton while `managed && !ready`, and disables its own query
   * whenever `managed` — so leaving the boundary up after the retries are exhausted would leave
   * every control in the feed a skeleton indefinitely, with no error surfaced and nothing to retry.
   * Dropping the boundary puts each row back on the query it would have run anyway: more requests,
   * but the counts appear.
   */
  const responseBatchFailed = responseBatch.isError;

  const timeLabel = TIME_OPTIONS.find(o => o.value === time)?.label ?? time;
  const sortLabel = SORT_OPTIONS.find(o => o.value === sort)?.label ?? sort;
  const spaceLabel =
    selectedSpaceId === 'all'
      ? 'Any space'
      : (initialSpaceOptions.find(o => o.value === selectedSpaceId)?.label ?? 'Any space');

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
                      <span
                        className={cx('inline-flex transition-transform duration-200', spaceMenuOpen && 'rotate-180')}
                      >
                        <ChevronDownSmall color="grey-04" />
                      </span>
                    </button>
                  }
                >
                  <MenuItem
                    active={selectedSpaceId === 'all'}
                    onClick={() => {
                      setSelectedSpaceId('all');
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
                        setSelectedSpaceId(o.value);
                        setSpaceMenuOpen(false);
                      }}
                    >
                      {o.label}
                    </MenuItem>
                  ))}
                </Menu>
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
          (() => {
            const cards = items.map(item => (
              <ExploreFeedCard
                key={`${item.entityId}-${item.spaceId}`}
                item={item}
                hideSpaceLink={lockedSpaceId != null}
                hideJoinButton={lockedSpaceId != null}
              />
            ));

            return responseBatchFailed ? (
              cards
            ) : (
              <ClaimResponseBatchBoundary ready={responseBatchReady}>{cards}</ClaimResponseBatchBoundary>
            );
          })()
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

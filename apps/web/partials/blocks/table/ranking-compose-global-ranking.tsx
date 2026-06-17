'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import cx from 'classnames';
import { flushSync } from 'react-dom';

import { getRowDescription, getRowDisplayName } from '~/core/blocks/ranking/ranking-rankable-list';
import type { RankingEntryDisplay } from '~/core/blocks/ranking/use-ranking-entry-entities';
import { useInfiniteScrollSentinel } from '~/core/space-members/use-space-participants-infinite';
import type { Row, SearchResult } from '~/core/types';

import { Button } from '~/design-system/button';
import { Search } from '~/design-system/icons/search';

import { RankingGlobalDesktopRow } from './ranking-block-ui';
import { COMPOSE_ICON_BUTTON_CLASS } from './ranking-compose-header';
import { useRankingComposeScrollRoot, useRankingComposeScrollRootRef } from './ranking-compose-layout';
import { RankingComposeSwipeableRow } from './ranking-compose-swipeable-row';
import { RankingEntryRow } from './ranking-entry-row';

const MOBILE_SEARCH_VISIBLE_TOP_OFFSET_PX = 8;
const SEARCH_LIST_ROW_HEIGHT_PX = 88;
const SEARCH_LIST_PLACEHOLDER_MIN_HEIGHT_PX = 4 * SEARCH_LIST_ROW_HEIGHT_PX;

function RankingComposeUnrankedDivider() {
  return (
    <div className="my-4 flex items-center gap-3" role="separator" aria-label="Unranked">
      <div className="h-px flex-1 bg-grey-02" aria-hidden />
      <span className="shrink-0 text-[17px] font-[600] text-text">Unranked</span>
      <div className="h-px flex-1 bg-grey-02" aria-hidden />
    </div>
  );
}

function computeSearchListStableHeight(scrollRoot: HTMLElement, listEl: HTMLElement | null) {
  const viewportBottom = scrollRoot.scrollTop + scrollRoot.clientHeight;

  if (!listEl) {
    return Math.max(SEARCH_LIST_PLACEHOLDER_MIN_HEIGHT_PX, scrollRoot.clientHeight);
  }

  const rootRect = scrollRoot.getBoundingClientRect();
  const listRect = listEl.getBoundingClientRect();
  const listTop = listRect.top - rootRect.top + scrollRoot.scrollTop;

  // Anchor to the visible viewport only — never use scrollHeight (it grows with placeholder height).
  return Math.max(SEARCH_LIST_PLACEHOLDER_MIN_HEIGHT_PX, viewportBottom - listTop);
}

function scrollMobilePageToElement(target: HTMLElement) {
  const scrollRoot = target.closest('[data-ranking-compose-mobile-scroll]');
  if (scrollRoot instanceof HTMLElement) {
    const rootRect = scrollRoot.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const nextScrollTop = scrollRoot.scrollTop + (targetRect.top - rootRect.top) - MOBILE_SEARCH_VISIBLE_TOP_OFFSET_PX;

    scrollRoot.scrollTo({
      top: Math.max(0, nextScrollTop),
      behavior: 'smooth',
    });
    return Math.max(0, nextScrollTop);
  }

  target.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
  return null;
}

function RankingComposeSearchListPlaceholder({
  height,
  children,
}: {
  height: number;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="flex shrink-0 flex-col justify-start overflow-hidden"
      style={{ height }}
      aria-hidden={!children}
    >
      {children}
    </div>
  );
}

function RankingComposeCreateNewPrompt({ onCreateNew }: { onCreateNew: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <p className="text-metadata text-grey-04">Can&apos;t find what you&apos;re looking for?</p>
      <Button variant="secondary" small onClick={onCreateNew}>
        Create new
      </Button>
    </div>
  );
}

function RankingComposePickRow({
  rank,
  name,
  description,
  imageUrl,
  spaceId,
  entityId,
  onAdd,
  isInMyRanking,
}: {
  rank?: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  spaceId: string;
  entityId: string;
  onAdd: () => void;
  isInMyRanking: boolean;
}) {
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (isInMyRanking) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onAdd();
    }
  };

  return (
    <div
      role="button"
      tabIndex={isInMyRanking ? -1 : 0}
      aria-label={isInMyRanking ? `${name} is in your ranking` : `Add ${name} to my ranking`}
      aria-disabled={isInMyRanking}
      onClick={() => {
        if (!isInMyRanking) onAdd();
      }}
      onKeyDown={handleKeyDown}
      className={cx(
        'flex w-full items-center py-3 text-left transition',
        isInMyRanking ? 'cursor-default' : 'cursor-pointer'
      )}
    >
      <RankingEntryRow
        rank={rank}
        rankStyle="leading"
        linkToEntity={false}
        entry={{
          entityId,
          name,
          description,
          image: imageUrl,
        }}
        spaceId={spaceId}
      />
    </div>
  );
}

type Props = {
  isMobile: boolean;
  spaceId: string;
  orderedIds: string[];
  filteredRankedIds: string[];
  filteredUnrankedIds: string[];
  globalRankByEntityId: Map<string, number>;
  rankableEntriesById: Map<string, RankingEntryDisplay>;
  searchResultsById: Map<string, SearchResult>;
  rowsByEntityId: Map<string, Row>;
  showRankedUnrankedDivider: boolean;
  hasVisibleRankableEntities: boolean;
  isSearchActive: boolean;
  isSearchSettled: boolean;
  isDebouncingAfterEmptySearch: boolean;
  isLoadingRows: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  hasAnyRankableEntityIds: boolean;
  onFetchNextPage: () => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  isSearchOpen: boolean;
  onSearchOpenChange: (open: boolean) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  onAddToMyRanking: (entityId: string) => void;
  onCreateNew: () => void;
  activeSwipeRowKey: string | null;
  onActiveSwipeRowKeyChange: (key: string | null) => void;
  onViewEntity: (entityId: string) => void;
};

export function RankingComposeGlobalRanking({
  isMobile,
  spaceId,
  orderedIds,
  filteredRankedIds,
  filteredUnrankedIds,
  globalRankByEntityId,
  rankableEntriesById,
  searchResultsById,
  rowsByEntityId,
  showRankedUnrankedDivider,
  hasVisibleRankableEntities,
  isSearchActive,
  isSearchSettled,
  isDebouncingAfterEmptySearch,
  isLoadingRows,
  isFetchingNextPage,
  hasNextPage,
  hasAnyRankableEntityIds,
  onFetchNextPage,
  searchQuery,
  onSearchQueryChange,
  isSearchOpen,
  onSearchOpenChange,
  searchInputRef,
  onAddToMyRanking,
  onCreateNew,
  activeSwipeRowKey,
  onActiveSwipeRowKeyChange,
  onViewEntity,
}: Props) {
  const isDesktop = !isMobile;
  const mobileScrollRootRef = useRankingComposeScrollRootRef();
  const mobileScrollRoot = useRankingComposeScrollRoot();
  const globalSectionRef = React.useRef<HTMLDivElement>(null);
  const globalSearchChromeRef = React.useRef<HTMLDivElement>(null);
  const searchFieldContainerRef = React.useRef<HTMLDivElement>(null);
  const listContainerRef = React.useRef<HTMLDivElement>(null);
  const searchScrollTopRef = React.useRef<number | null>(null);
  const [searchListStableHeight, setSearchListStableHeight] = React.useState(SEARCH_LIST_PLACEHOLDER_MIN_HEIGHT_PX);
  const [listScrollRoot, setListScrollRoot] = React.useState<Element | null>(null);
  const setListContainerRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      listContainerRef.current = node;
      if (isDesktop) {
        setListScrollRoot(node);
      }
    },
    [isDesktop]
  );
  const scrollRoot = isDesktop ? listScrollRoot : mobileScrollRoot;

  const getPageScrollRoot = React.useCallback((): HTMLElement | null => {
    if (isMobile) {
      return mobileScrollRootRef?.current ?? null;
    }
    return listContainerRef.current;
  }, [isMobile, mobileScrollRootRef]);

  const captureSearchListLayout = React.useCallback(
    (options?: { scrollTop?: number }) => {
      const pageScrollRoot = getPageScrollRoot();
      if (!pageScrollRoot) return;

      searchScrollTopRef.current = options?.scrollTop ?? pageScrollRoot.scrollTop;
      setSearchListStableHeight(computeSearchListStableHeight(pageScrollRoot, listContainerRef.current));
    },
    [getPageScrollRoot]
  );

  const handleSearchQueryChange = React.useCallback(
    (value: string) => {
      const isFirstSearchCharacter = value.trim().length > 0 && searchQuery.trim().length === 0;
      if (isFirstSearchCharacter) {
        captureSearchListLayout();
      }
      onSearchQueryChange(value);
    },
    [captureSearchListLayout, onSearchQueryChange, searchQuery]
  );

  React.useEffect(() => {
    if (!isSearchOpen && !searchQuery.trim()) {
      searchScrollTopRef.current = null;
      setSearchListStableHeight(SEARCH_LIST_PLACEHOLDER_MIN_HEIGHT_PX);
    }
  }, [isSearchOpen, searchQuery]);

  const isSearchingWithNoResults = !hasVisibleRankableEntities && (isSearchSettled || isDebouncingAfterEmptySearch);
  const showSearchLoadingPlaceholder =
    isSearchActive &&
    !isSearchingWithNoResults &&
    !hasVisibleRankableEntities &&
    (isLoadingRows || !isSearchSettled);
  const needsSearchStablePlaceholder =
    isSearchActive && (isSearchingWithNoResults || showSearchLoadingPlaceholder);

  React.useLayoutEffect(() => {
    if (!needsSearchStablePlaceholder) return;

    const pageScrollRoot = getPageScrollRoot();
    if (!pageScrollRoot) return;

    setSearchListStableHeight(computeSearchListStableHeight(pageScrollRoot, listContainerRef.current));
  }, [getPageScrollRoot, needsSearchStablePlaceholder]);

  const canLoadMore = hasNextPage && hasVisibleRankableEntities;

  const sentinelRef = useInfiniteScrollSentinel({
    hasNextPage: canLoadMore,
    isFetchingNextPage,
    fetchNextPage: onFetchNextPage,
    root: scrollRoot,
  });

  // Prefetch when the list is shorter than its scroll container (sentinel stays in view).
  React.useEffect(() => {
    if (!scrollRoot || !canLoadMore || isFetchingNextPage) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const rootRect = scrollRoot.getBoundingClientRect();
    const sentinelRect = sentinel.getBoundingClientRect();
    if (sentinelRect.top <= rootRect.bottom + 200) {
      onFetchNextPage();
    }
  }, [
    scrollRoot,
    canLoadMore,
    isFetchingNextPage,
    onFetchNextPage,
    filteredRankedIds.length,
    filteredUnrankedIds.length,
    sentinelRef,
  ]);

  React.useEffect(() => {
    if (isSearchOpen) {
      searchInputRef.current?.focus({ preventScroll: true });
    }
  }, [isSearchOpen, searchInputRef]);

  React.useEffect(() => {
    if (searchQuery.trim()) {
      onSearchOpenChange(true);
    }
  }, [searchQuery, onSearchOpenChange]);

  const renderPickEntity = (id: string, globalRank?: number) => {
    const entry = rankableEntriesById.get(id);
    const row = rowsByEntityId.get(id);
    const searchHit = searchResultsById.get(id);
    const isInMyRanking = orderedIds.includes(id);
    const pickRow = (
      <RankingComposePickRow
        entityId={id}
        spaceId={spaceId}
        rank={globalRank}
        name={entry?.name ?? (row ? getRowDisplayName(row) : searchHit?.name?.trim() || 'Untitled')}
        description={entry?.description ?? (row ? getRowDescription(row) : (searchHit?.description ?? null))}
        imageUrl={entry?.image ?? row?.columns[SystemIds.NAME_PROPERTY]?.image ?? null}
        onAdd={() => onAddToMyRanking(id)}
        isInMyRanking={isInMyRanking}
      />
    );

    if (!isMobile) {
      return (
        <RankingGlobalDesktopRow key={id} onOpenSidePanel={() => onViewEntity(id)}>
          {pickRow}
        </RankingGlobalDesktopRow>
      );
    }

    return (
      <RankingComposeSwipeableRow
        key={id}
        rowKey={`global:${id}`}
        activeRowKey={activeSwipeRowKey}
        onActiveRowKeyChange={onActiveSwipeRowKeyChange}
        onView={() => onViewEntity(id)}
        onPrimaryClick={() => onAddToMyRanking(id)}
        primaryDisabled={isInMyRanking}
      >
        {pickRow}
      </RankingComposeSwipeableRow>
    );
  };

  const searchResultList = (
    <>
      {filteredRankedIds.map(id => renderPickEntity(id, globalRankByEntityId.get(id)))}
      {showRankedUnrankedDivider ? <RankingComposeUnrankedDivider /> : null}
      {filteredUnrankedIds.map(id => renderPickEntity(id))}
      {canLoadMore ? <div ref={sentinelRef} className="h-px" aria-hidden /> : null}
      {canLoadMore && isFetchingNextPage ? (
        <p className="py-3 text-metadata text-grey-03">Loading more…</p>
      ) : null}
      {isSearchActive && !canLoadMore && isSearchSettled && hasVisibleRankableEntities ? (
        <RankingComposeCreateNewPrompt onCreateNew={onCreateNew} />
      ) : null}
    </>
  );

  const browseResultList = (
    <>
      {filteredRankedIds.map(id => renderPickEntity(id, globalRankByEntityId.get(id)))}
      {showRankedUnrankedDivider ? <RankingComposeUnrankedDivider /> : null}
      {filteredUnrankedIds.map(id => renderPickEntity(id))}
      {canLoadMore ? <div ref={sentinelRef} className="h-px" aria-hidden /> : null}
      {canLoadMore && isFetchingNextPage ? (
        <p className="py-3 text-metadata text-grey-03">Loading more…</p>
      ) : null}
    </>
  );

  return (
    <div
      ref={globalSectionRef}
      className={cx('flex flex-col', isDesktop && 'min-h-0 flex-1')}
      style={{ scrollMarginTop: MOBILE_SEARCH_VISIBLE_TOP_OFFSET_PX }}
    >
      <div
        ref={globalSearchChromeRef}
        className="shrink-0"
        style={{ scrollMarginTop: MOBILE_SEARCH_VISIBLE_TOP_OFFSET_PX }}
      >
        <div
          className={cx(
            'grid w-full min-w-0 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3',
            isDesktop && 'border-b border-grey-02 pb-4'
          )}
        >
          <h2
            className={cx(
              'm-0 min-w-0 truncate text-text',
              isMobile ? 'text-[22px] font-medium' : 'text-[17px] font-semibold'
            )}
          >
            Global ranking
          </h2>
          <div className="flex items-center justify-self-end">
            <Button
              type="button"
              variant="ghost"
              icon={<Search color={isSearchOpen ? undefined : 'grey-04'} />}
              onClick={() => {
                if (isSearchOpen) {
                  onSearchOpenChange(false);
                  return;
                }

                if (isMobile) {
                  flushSync(() => onSearchOpenChange(true));
                  const scrollTarget = globalSearchChromeRef.current ?? globalSectionRef.current;
                  const nextScrollTop = scrollTarget ? scrollMobilePageToElement(scrollTarget) : null;
                  captureSearchListLayout({ scrollTop: nextScrollTop ?? undefined });
                  searchInputRef.current?.focus({ preventScroll: true });
                  return;
                }

                onSearchOpenChange(true);
              }}
              className={cx(
                COMPOSE_ICON_BUTTON_CLASS,
                'h-8 w-8 !bg-transparent text-grey-04 transition-colors hover:!border-transparent hover:!bg-transparent hover:!text-text',
                isSearchOpen && '!text-text'
              )}
              aria-label={isSearchOpen ? 'Close search' : 'Search rankable entities'}
              aria-expanded={isSearchOpen}
            />
          </div>
        </div>
        {isSearchOpen ? (
          <div ref={searchFieldContainerRef} className="shrink-0 py-2">
            <div className="relative flex items-center">
              <span className="pointer-events-none absolute left-2 flex">
                <Search color="grey-04" />
              </span>
              <input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={e => handleSearchQueryChange(e.target.value)}
                placeholder="Search"
                aria-label="Search rankable entities"
                className="h-8 w-full rounded border border-grey-02 bg-white py-1 pr-2 pl-8 text-metadata text-text outline-hidden focus-visible:border-text"
              />
            </div>
          </div>
        ) : null}
      </div>
      <div className={cx('flex min-h-0 flex-1 flex-col', isDesktop && 'pt-4')}>
        <div ref={setListContainerRef} className={cx(isDesktop && 'min-h-0 flex-1 overflow-x-hidden overflow-y-auto')}>
          {isSearchActive ? (
            showSearchLoadingPlaceholder ? (
              <RankingComposeSearchListPlaceholder height={searchListStableHeight} />
            ) : isSearchingWithNoResults ? (
              <RankingComposeSearchListPlaceholder height={searchListStableHeight}>
                <RankingComposeCreateNewPrompt onCreateNew={onCreateNew} />
              </RankingComposeSearchListPlaceholder>
            ) : (
              searchResultList
            )
          ) : isLoadingRows && !hasAnyRankableEntityIds ? (
            <RankingComposeSearchListPlaceholder height={searchListStableHeight} />
          ) : !hasVisibleRankableEntities ? null : (
            browseResultList
          )}
        </div>
      </div>
    </div>
  );
}

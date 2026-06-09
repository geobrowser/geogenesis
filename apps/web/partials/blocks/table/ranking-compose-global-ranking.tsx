'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import cx from 'classnames';

import { getRowDescription, getRowDisplayName } from '~/core/blocks/ranking/ranking-rankable-list';
import type { RankingEntryDisplay } from '~/core/blocks/ranking/use-ranking-entry-entities';
import { useInfiniteScrollSentinel } from '~/core/space-members/use-space-participants-infinite';
import type { Row } from '~/core/types';

import { Button } from '~/design-system/button';
import { Search } from '~/design-system/icons/search';

import { COMPOSE_ICON_BUTTON_CLASS } from './ranking-compose-header';
import { useRankingComposeScrollRoot } from './ranking-compose-layout';
import { RankingContributePointsBanner } from './ranking-contribute-points-banner';
import { RankingEntryRow } from './ranking-entry-row';

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
        isInMyRanking ? 'cursor-default' : 'cursor-pointer hover:bg-grey-01'
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
  rowsByEntityId: Map<string, Row>;
  showRankedUnrankedDivider: boolean;
  hasVisibleRankableEntities: boolean;
  hasPopulatedMyRanking: boolean;
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
};

export function RankingComposeGlobalRanking({
  isMobile,
  spaceId,
  orderedIds,
  filteredRankedIds,
  filteredUnrankedIds,
  globalRankByEntityId,
  rankableEntriesById,
  rowsByEntityId,
  showRankedUnrankedDivider,
  hasVisibleRankableEntities,
  hasPopulatedMyRanking,
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
}: Props) {
  const isDesktop = !isMobile;
  const mobileScrollRoot = useRankingComposeScrollRoot();
  const [listScrollRoot, setListScrollRoot] = React.useState<Element | null>(null);
  const listScrollRootRef = React.useCallback((node: HTMLDivElement | null) => {
    setListScrollRoot(node);
  }, []);
  const scrollRoot = isDesktop ? listScrollRoot : mobileScrollRoot;

  const canLoadMore = hasNextPage;

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
      searchInputRef.current?.focus();
    }
  }, [isSearchOpen, searchInputRef]);

  React.useEffect(() => {
    if (searchQuery.trim()) {
      onSearchOpenChange(true);
    }
  }, [searchQuery, onSearchOpenChange]);

  const isSearchingWithNoResults = searchQuery.trim().length > 0 && !hasVisibleRankableEntities && !isLoadingRows;

  const renderPickEntity = (id: string, globalRank?: number) => {
    const entry = rankableEntriesById.get(id);
    const row = rowsByEntityId.get(id);
    return (
      <RankingComposePickRow
        key={id}
        entityId={id}
        spaceId={spaceId}
        rank={globalRank}
        name={entry?.name ?? (row ? getRowDisplayName(row) : 'Untitled')}
        description={entry?.description ?? (row ? getRowDescription(row) : null)}
        imageUrl={entry?.image ?? row?.columns[SystemIds.NAME_PROPERTY]?.image ?? null}
        onAdd={() => onAddToMyRanking(id)}
        isInMyRanking={orderedIds.includes(id)}
      />
    );
  };

  return (
    <div className={cx('flex flex-col', isDesktop && 'min-h-0 flex-1')}>
      <div
        className={cx(
          'grid w-full min-w-0 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3',
          isDesktop && 'border-b border-grey-02 pb-4'
        )}
      >
        <h2 className={cx('m-0 min-w-0 truncate font-bold text-text', isMobile ? 'text-[22px]' : 'text-[17px]')}>
          Global ranking
        </h2>
        <div className="flex items-center justify-self-end">
          <Button
            type="button"
            variant="ghost"
            icon={<Search color={isSearchOpen ? undefined : 'grey-04'} />}
            onClick={() => onSearchOpenChange(!isSearchOpen)}
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
      <div className={cx('flex min-h-0 flex-1 flex-col', isDesktop && 'pt-4')}>
        {isMobile && !hasPopulatedMyRanking ? <RankingContributePointsBanner /> : null}
        {isSearchOpen ? (
          <div className="shrink-0 py-2">
            <div className="relative flex items-center">
              <span className="pointer-events-none absolute left-2 flex">
                <Search color="grey-04" />
              </span>
              <input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={e => onSearchQueryChange(e.target.value)}
                placeholder="Search"
                aria-label="Search rankable entities"
                className="h-8 w-full rounded border border-grey-02 bg-white py-1 pr-2 pl-8 text-metadata text-text outline-hidden focus-visible:border-text"
              />
            </div>
          </div>
        ) : null}
        <div
          ref={isDesktop ? listScrollRootRef : undefined}
          className={cx(isDesktop && 'min-h-0 flex-1 overflow-y-auto')}
        >
          {isLoadingRows && !hasAnyRankableEntityIds ? (
            <p className="py-6 text-metadata text-grey-03">Loading entities…</p>
          ) : isSearchingWithNoResults ? (
            <RankingComposeCreateNewPrompt onCreateNew={onCreateNew} />
          ) : !hasVisibleRankableEntities ? null : (
            <>
              {filteredRankedIds.map(id => renderPickEntity(id, globalRankByEntityId.get(id)))}
              {showRankedUnrankedDivider ? <div className="my-3 border-t border-grey-02" role="separator" /> : null}
              {filteredUnrankedIds.map(id => renderPickEntity(id))}
              {canLoadMore ? <div ref={sentinelRef} className="h-px" aria-hidden /> : null}
              {canLoadMore && isFetchingNextPage ? (
                <p className="py-3 text-metadata text-grey-03">Loading more…</p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

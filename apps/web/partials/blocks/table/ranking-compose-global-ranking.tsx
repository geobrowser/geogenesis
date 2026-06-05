'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import cx from 'classnames';

import { RANKING_POINTS_UI_ENABLED } from '~/core/blocks/ranking/ranking-points';
import { getRowDescription, getRowDisplayName } from '~/core/blocks/ranking/ranking-rankable-list';
import type { RankingEntryDisplay } from '~/core/blocks/ranking/use-ranking-entry-entities';
import type { Row } from '~/core/types';

import { Button } from '~/design-system/button';
import { Search } from '~/design-system/icons/search';
import { Stars } from '~/design-system/icons/stars';

import { COMPOSE_ICON_BUTTON_CLASS } from './ranking-compose-header';
import { RankingEntryRow } from './ranking-entry-row';

function RankingComposePointsBanner() {
  if (!RANKING_POINTS_UI_ENABLED) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 rounded-lg bg-purple/10 px-3 py-2.5 text-metadata text-purple">
      <Stars color="purple" />
      <span className="flex-1">Earn up to 10 points by contributing</span>
      <span className="text-purple" aria-hidden>
        ?
      </span>
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
        'flex w-full items-start gap-3 py-3 text-left transition',
        isInMyRanking ? 'cursor-default' : 'cursor-pointer hover:bg-grey-01'
      )}
    >
      {rank != null && rank > 0 ? (
        <span className="mt-4 w-5 shrink-0 text-center text-button font-medium text-text tabular-nums">{rank}</span>
      ) : (
        <span className="w-5 shrink-0" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <RankingEntryRow
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
  hasAnyRankableEntityIds: boolean;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
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
  hasAnyRankableEntityIds,
  sentinelRef,
  searchQuery,
  onSearchQueryChange,
  isSearchOpen,
  onSearchOpenChange,
  searchInputRef,
  onAddToMyRanking,
  onCreateNew,
}: Props) {
  const isDesktop = !isMobile;

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
    <>
      <div
        className={cx(
          'grid w-full min-w-0 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3',
          isDesktop && 'h-10 border-b border-grey-02'
        )}
      >
        <h2 className="m-0 min-w-0 truncate text-smallTitle font-medium text-text">Global ranking</h2>
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
      {isMobile && !hasPopulatedMyRanking ? <RankingComposePointsBanner /> : null}
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
          {isSearchOpen && !hasVisibleRankableEntities && !isLoadingRows ? (
            <RankingComposeCreateNewPrompt onCreateNew={onCreateNew} />
          ) : null}
        </div>
      ) : null}
      <div className={cx(isDesktop && 'min-h-0 flex-1 overflow-y-auto')}>
        {isLoadingRows && !hasAnyRankableEntityIds ? (
          <p className="py-6 text-metadata text-grey-03">Loading entities…</p>
        ) : !hasVisibleRankableEntities ? null : (
          <>
            {filteredRankedIds.map(id => renderPickEntity(id, globalRankByEntityId.get(id)))}
            {showRankedUnrankedDivider ? <div className="my-3 border-t border-grey-02" role="separator" /> : null}
            {filteredUnrankedIds.map(id => renderPickEntity(id))}
            <div ref={sentinelRef} className="h-px" />
            {isFetchingNextPage ? <p className="py-3 text-metadata text-grey-03">Loading more…</p> : null}
            <RankingComposeCreateNewPrompt onCreateNew={onCreateNew} />
          </>
        )}
      </div>
    </>
  );
}

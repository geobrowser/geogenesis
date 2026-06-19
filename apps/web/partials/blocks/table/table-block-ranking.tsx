'use client';

import * as React from 'react';

import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';

import { IconButton } from '~/design-system/button';
import { FilterTable } from '~/design-system/icons/filter-table';
import { FilterTableWithFilters } from '~/design-system/icons/filter-table-with-filters';
import { Fullscreen } from '~/design-system/icons/full-screen';

import { RankingBlockBody } from './ranking-block-body';
import { RankingPeriodMetadata } from './ranking-period-metadata';
import { TableBlockContextMenu } from './table-block-context-menu';
import { TableBlockEditableFilters } from './table-block-editable-filters';
import { useRankingBlockState } from './use-ranking-block-state';

type Props = {
  spaceId: string;
  rankingStartDate?: string;
  rankingEndDate?: string;
};

export function TableBlockRanking({ spaceId, rankingStartDate = '', rankingEndDate = '' }: Props) {
  const state = useRankingBlockState({ spaceId, rankingStartDate, rankingEndDate, paginateEmbeddedRanking: true });
  const {
    canEdit,
    filterState,
    setFilterState,
    source,
    isFilterOpen,
    setIsFilterOpen,
    displayName,
    periodState,
    periodLabel,
    hasRankedByOthers,
    submissions,
    aggregatedSubmitterSpaceIds,
    aggregatedRankingCount,
    openRankingCompose,
    globalSharePath,
    ensureGlobalRankingOg,
  } = state;

  return (
    <div className="w-full min-w-0 overflow-x-hidden" onMouseDown={e => e.stopPropagation()}>
      <div className="mb-2 flex items-start justify-between gap-4" onMouseDown={e => e.stopPropagation()}>
        <div className="min-w-0 flex-1">
          <h4 className="text-mediumTitle text-text">{displayName}</h4>

          {periodLabel || hasRankedByOthers ? (
            <RankingPeriodMetadata
              periodState={periodState}
              periodLabel={periodLabel}
              hasRankedByOthers={hasRankedByOthers}
              submissions={submissions}
              aggregatedSubmitterSpaceIds={aggregatedSubmitterSpaceIds}
              aggregatedRankingCount={aggregatedRankingCount}
            />
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-5">
          <IconButton
            onClick={() => setIsFilterOpen(open => !open)}
            icon={filterState.length > 0 ? <FilterTableWithFilters /> : <FilterTable />}
            color="grey-04"
          />

          <IconButton
            onClick={() => void openRankingCompose('view')}
            icon={<Fullscreen color="grey-04" />}
            color="grey-04"
            aria-label="Open fullscreen ranking"
          />

          <TableBlockContextMenu
            sourceType={source.type}
            globalRankingSharePath={globalSharePath}
            onPrepareGlobalShareLink={ensureGlobalRankingOg}
          />
        </div>
      </div>

      {isFilterOpen && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cx('mb-4 overflow-hidden', canEdit ? 'border-t border-divider py-4' : 'py-2')}
            onMouseDown={e => e.stopPropagation()}
          >
            <TableBlockEditableFilters
              filterState={filterState}
              setFilterState={setFilterState}
              filterSuggestionSpaceId={spaceId}
              isEditing={canEdit}
            />
          </motion.div>
        </AnimatePresence>
      )}

      <RankingBlockBody state={state} presentation="embedded" />
    </div>
  );
}

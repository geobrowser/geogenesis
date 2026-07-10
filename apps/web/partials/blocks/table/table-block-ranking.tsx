'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import { produce } from 'immer';

import { DATA_BLOCK_VIEW_EXPLORE_ID } from '~/core/data-block-ids';
import { ID } from '~/core/id';
import { RANKING_VIEW_PILL_ID } from '~/core/ranking-block-ids';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';

import { IconButton } from '~/design-system/button';
import { FilterTable } from '~/design-system/icons/filter-table';
import { FilterTableWithFilters } from '~/design-system/icons/filter-table-with-filters';
import { Fullscreen } from '~/design-system/icons/full-screen';

import {
  BlockLinkIngestionChip,
  BlockLinkIngestionPanel,
  BlockLinkIngestionProvider,
} from './block-link-ingestion-tool';
import { DataBlockScopeDropdown } from './data-block-scope-dropdown';
import { DataBlockViewMenu } from './data-block-view-menu';
import { RankingBlockBody } from './ranking-block-body';
import { RankingExploreView } from './ranking-explore-view';
import { RankingGalleryView } from './ranking-gallery-view';
import { RankingHeaderActions } from './ranking-header-actions';
import { RankingListView } from './ranking-list-view';
import { RankingPillView } from './ranking-pill-view';
import { RankingPeriodMetadata } from './ranking-period-metadata';
import { TableBlockContextMenu } from './table-block-context-menu';
import { TableBlockEditableFilters } from './table-block-editable-filters';
import type { TableBlockFilterPromptHandle } from './table-block-filter-creation-prompt';
import { TableBlockFilterGroupPill, groupFilters } from './table-block-filter-pill';
import { useRankingBlockState } from './use-ranking-block-state';

type Props = {
  spaceId: string;
  rankingStartDate?: string;
  rankingEndDate?: string;
};

export function TableBlockRanking({ spaceId, rankingStartDate = '', rankingEndDate = '' }: Props) {
  const state = useRankingBlockState({ spaceId, rankingStartDate, rankingEndDate, paginateEmbeddedRanking: true });
  const isEditing = useUserIsEditing(spaceId);
  const {
    filterState,
    resolvedFilterState,
    filterMode,
    setFilterState,
    setFilterMode,
    source,
    setSource,
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
    stateView,
    stateViewRelation,
  } = state;

  const isGalleryView = Boolean(
    (stateViewRelation && ID.equals(stateViewRelation.toEntity.id, SystemIds.GALLERY_VIEW)) || stateView === 'GALLERY'
  );
  const isListView = Boolean(
    (stateViewRelation && ID.equals(stateViewRelation.toEntity.id, SystemIds.LIST_VIEW)) || stateView === 'LIST'
  );
  const isPillView = Boolean(
    (stateViewRelation && ID.equals(stateViewRelation.toEntity.id, RANKING_VIEW_PILL_ID)) || stateView === 'PILL'
  );
  const isExploreView = Boolean(
    (stateViewRelation && ID.equals(stateViewRelation.toEntity.id, DATA_BLOCK_VIEW_EXPLORE_ID)) ||
      stateView === 'EXPLORE'
  );

  const showHeaderActions = isExploreView || isListView || isPillView || isGalleryView;
  
  const showBrowseChrome = !showHeaderActions || isEditing;

  const filterPromptRef = React.useRef<TableBlockFilterPromptHandle>(null);

  const filterGroupsForToolbarPills = React.useMemo(
    () => groupFilters(resolvedFilterState).filter(g => !ID.equals(g.columnId, SystemIds.SPACE_FILTER)),
    [resolvedFilterState]
  );

  return (
    <BlockLinkIngestionProvider spaceId={spaceId}>
      <div className="w-full min-w-0 overflow-x-hidden" onMouseDown={e => e.stopPropagation()}>
        <div className="mb-2 flex items-start justify-between gap-4" onMouseDown={e => e.stopPropagation()}>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h4 className="min-w-0 truncate text-mediumTitle text-text">{displayName}</h4>
              <div className="shrink-0">
                <BlockLinkIngestionChip />
              </div>
            </div>

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

        <BlockLinkIngestionPanel />

        {isFilterOpen && (
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={cx('mb-4 overflow-hidden', isEditing ? 'border-t border-divider py-4' : 'py-2')}
              onMouseDown={e => e.stopPropagation()}
            >
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <DataBlockScopeDropdown source={source} setSource={setSource} isEditing={isEditing} />
                  {isEditing && (
                    <>
                      <span className="mx-0.5 h-5 w-px shrink-0 bg-divider" aria-hidden />
                      <TableBlockEditableFilters
                        ref={filterPromptRef}
                        filterState={filterState}
                        setFilterState={setFilterState}
                        filterSuggestionSpaceId={spaceId}
                        isEditing={isEditing}
                      />
                    </>
                  )}
                  {!isEditing &&
                    filterGroupsForToolbarPills.map(group => (
                      <TableBlockFilterGroupPill
                        key={group.columnId}
                        group={group}
                        mode={filterMode}
                        onToggleMode={() => setFilterMode(filterMode === 'AND' ? 'OR' : 'AND')}
                        onDeleteValue={originalIndex => {
                          setFilterState(
                            produce(resolvedFilterState, draft => {
                              draft.splice(originalIndex, 1);
                            })
                          );
                        }}
                        onClearGroup={() => {
                          setFilterState(resolvedFilterState.filter(f => f.columnId !== group.columnId));
                        }}
                        isEditing={isEditing}
                      />
                    ))}
                </div>
                {isEditing && filterGroupsForToolbarPills.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    {filterGroupsForToolbarPills.map(group => (
                      <TableBlockFilterGroupPill
                        key={group.columnId}
                        group={group}
                        mode={filterMode}
                        onToggleMode={() => setFilterMode(filterMode === 'AND' ? 'OR' : 'AND')}
                        onDeleteValue={originalIndex => {
                          setFilterState(
                            produce(resolvedFilterState, draft => {
                              draft.splice(originalIndex, 1);
                            })
                          );
                        }}
                        onClearGroup={() => {
                          setFilterState(resolvedFilterState.filter(f => f.columnId !== group.columnId));
                        }}
                        onAddSimilar={anchorEl => {
                          requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                              filterPromptRef.current?.openWithColumn(group.columnId, anchorEl);
                            });
                          });
                        }}
                        isEditing={isEditing}
                      />
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        )}

        <RankingBlockBody state={state} presentation="embedded" />
      </div>
    </BlockLinkIngestionProvider>
  );
}

'use client';

import * as React from 'react';

import cx from 'classnames';

import { isPlaceholderRankingEntry } from '~/core/blocks/ranking/ranking-pending-proposal-entries';

import { Button } from '~/design-system/button';
import { RankingChart } from '~/design-system/icons/ranking-chart';
import { XIcon } from '~/design-system/icons/x';

import { RankingBlockGlobalPagination } from './ranking-block-global-pagination';
import {
  RankingFirstSubmissionPrompt,
  RankingFullscreenSectionHeaderRow,
  RankingGlobalDesktopRow,
  RankingMyRankingDesktopRow,
  RankingSectionHeaderRow,
  RankingSubmitCtaBanner,
  RankingTabButton,
} from './ranking-block-ui';
import { RankingComposeEntitySheet } from './ranking-compose-entity-sheet';
import { RankingComposeSwipeableRow } from './ranking-compose-swipeable-row';
import { RankingEntryRow, RankingEntryRowSkeleton } from './ranking-entry-row';
import { RankingMyRankingDndList } from './ranking-my-ranking-dnd';
import type { RankingBlockPresentation, RankingBlockState } from './use-ranking-block-state';

type Props = {
  state: RankingBlockState;
  presentation?: RankingBlockPresentation;
};

function buildMobileFullscreenEditButton(state: RankingBlockState) {
  const { isSaving, isSharedRankingView, openRankingCompose } = state;
  if (isSharedRankingView) return null;

  return (
    <Button
      variant="secondary"
      className="h-8 shrink-0 !rounded-full !border-text !bg-white !px-4 text-[16px] whitespace-nowrap !text-text"
      disabled={isSaving}
      onClick={() => void openRankingCompose('edit')}
    >
      Edit
    </Button>
  );
}

function buildMyRankingActionButton(state: RankingBlockState) {
  const { showEditRankingButton, isSaving, openRankingCompose } = state;

  return showEditRankingButton ? (
    <Button
      variant="secondary"
      className="h-8 shrink-0 !rounded-full !border-text !bg-white !px-3 text-[16px] whitespace-nowrap !text-text"
      icon={<RankingChart />}
      disabled={isSaving}
      onClick={() => void openRankingCompose('edit')}
    >
      Edit my ranking
    </Button>
  ) : (
    <Button
      variant="primary"
      className="h-8 shrink-0 !rounded-full border-grey-02 bg-text !px-3 text-[16px] whitespace-nowrap text-white hover:bg-text/90 focus-visible:border-text focus-visible:shadow-inner-text"
      icon={<RankingChart color="white" />}
      disabled={isSaving}
      onClick={() => void openRankingCompose('edit')}
    >
      Add my ranking
    </Button>
  );
}

function buildMyRankingTabActions(state: RankingBlockState) {
  const {
    isSharedRankingView,
    showEditRankingButton,
    canSharePersonalRanking,
    sharePersonalRanking,
    isSaving,
    openRankingCompose,
  } = state;
  if (isSharedRankingView) return null;
  if (!showEditRankingButton && !canSharePersonalRanking) return null;

  return (
    <div className="flex w-full shrink-0 items-center justify-between gap-2">
      {showEditRankingButton ? (
        <Button
          variant="secondary"
          className="h-8 shrink-0 !rounded-full !border-text !bg-white !px-4 text-[16px] whitespace-nowrap !text-text"
          disabled={isSaving}
          onClick={() => void openRankingCompose('edit')}
        >
          Edit
        </Button>
      ) : null}
      {canSharePersonalRanking ? (
        <Button
          variant="primary"
          className={cx(
            'h-8 shrink-0 !rounded-full border-grey-02 bg-text !px-3 text-[16px] whitespace-nowrap text-white hover:bg-text/90 focus-visible:border-text focus-visible:shadow-inner-text',
            !showEditRankingButton && 'ml-auto'
          )}
          onClick={sharePersonalRanking}
        >
          Share
          <XIcon color="white" />
        </Button>
      ) : null}
    </div>
  );
}

export function RankingBlockBody({ state, presentation = 'embedded' }: Props) {
  const {
    spaceId,
    isMobile,
    showFirstRankingPrompt,
    showMyRankingTab,
    showMyRankingSection,
    showAddMyRankingInGlobalHeader,
    myRankingTabLabel,
    activeTab,
    setActiveTab,
    globalDisplayEntityIds,
    totalGlobalRankingEntityCount,
    hasMyRankingData,
    globalRankingEntryByEntityId,
    globalRankByEntityId,
    pendingEntityIds,
    entriesResolving,
    showEmbeddedGlobalPagination,
    embeddedGlobalPageNumber,
    hasEmbeddedGlobalPreviousPage,
    hasEmbeddedGlobalNextPage,
    setEmbeddedGlobalPage,
    myDisplayEntityIds,
    totalMyRankingEntityCount,
    embeddedMyPageNumber,
    showEmbeddedMyPagination,
    hasEmbeddedMyPreviousPage,
    hasEmbeddedMyNextPage,
    setEmbeddedMyPage,
    myRankingEntryByEntityId,
    draftHydrated,
    hasMySubmission,
    isSharedRankingView,
    reorderMyRanking,
    openEntitySheet,
    activeSwipeRowKey,
    setActiveSwipeRowKey,
    isMyRankingDragging,
    setIsMyRankingDragging,
    entitySheetTarget,
    setEntitySheetTarget,
    pageSize,
  } = state;

  const myRankingActionButton = buildMyRankingActionButton(state);
  const myRankingTabActions = buildMyRankingTabActions(state);
  const SectionHeader = presentation === 'fullscreen' ? RankingFullscreenSectionHeaderRow : RankingSectionHeaderRow;

  // On mobile fullscreen the action buttons move below the My ranking tab.
  const isFullscreenMobile = presentation === 'fullscreen' && isMobile;
  const movesEditBelowTabs = isFullscreenMobile && showMyRankingSection && !isSharedRankingView;
  const movesSharedAddBelowTabs = isFullscreenMobile && isSharedRankingView && showAddMyRankingInGlobalHeader;
  const movesActionBelowTabs = movesEditBelowTabs || movesSharedAddBelowTabs;
  const showMyTabActionsBelowTabs =
    presentation === 'fullscreen' && activeTab === 'my' && showMyRankingSection && Boolean(myRankingTabActions);

  const wrapMobileSwipeRow = ({
    rowKey,
    showRemove = false,
    onView,
    onRemove,
    onPrimaryClick,
    primaryDisabled = false,
    children,
  }: {
    rowKey: string;
    showRemove?: boolean;
    onView: () => void;
    onRemove?: () => void;
    onPrimaryClick?: () => void;
    primaryDisabled?: boolean;
    children: React.ReactNode;
  }) => {
    if (!isMobile) return children;

    return (
      <RankingComposeSwipeableRow
        rowKey={rowKey}
        activeRowKey={activeSwipeRowKey}
        onActiveRowKeyChange={setActiveSwipeRowKey}
        showRemove={showRemove}
        onView={onView}
        onRemove={onRemove}
        onPrimaryClick={onPrimaryClick}
        primaryDisabled={primaryDisabled}
        swipeEnabled={!isMyRankingDragging}
      >
        {children}
      </RankingComposeSwipeableRow>
    );
  };

  const globalRankingPagination =
    presentation === 'embedded' && showEmbeddedGlobalPagination ? (
      <RankingBlockGlobalPagination
        pageNumber={embeddedGlobalPageNumber}
        hasPreviousPage={hasEmbeddedGlobalPreviousPage}
        hasNextPage={hasEmbeddedGlobalNextPage}
        onSetPage={setEmbeddedGlobalPage}
      />
    ) : null;

  const globalRankingBody = (
    <div className="flex flex-col gap-4">
      {totalGlobalRankingEntityCount === 0 ? (
        hasMyRankingData ? (
          <p className="text-metadata text-grey-04">No published items yet</p>
        ) : (
          <RankingSubmitCtaBanner />
        )
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {globalDisplayEntityIds.map(entityId => {
              const entry = globalRankingEntryByEntityId.get(entityId);
              const rank = globalRankByEntityId.get(entityId);
              if (rank == null) return null;
              // Rank is known from relations/seed before the entity name/image
              // resolve — render a skeleton row so the list keeps its height
              // instead of collapsing until entries hydrate. Also skeleton a
              // still-unnamed seed row while resolution is in flight so a
              // throttled refresh doesn't flash "Untitled".
              if (!entry || (entriesResolving && isPlaceholderRankingEntry(entry))) {
                return (
                  <div key={entityId} className="w-full">
                    <RankingEntryRowSkeleton rank={rank} />
                  </div>
                );
              }
              const rowContent = (
                <RankingEntryRow
                  rank={rank}
                  rankStyle="leading"
                  entry={entry}
                  spaceId={spaceId}
                  linkToEntity={!isMobile}
                  pending={pendingEntityIds.has(entityId)}
                  showVotes
                />
              );
              return (
                <div key={entityId} className="w-full">
                  {isMobile ? (
                    wrapMobileSwipeRow({
                      rowKey: `global:${entityId}`,
                      onView: () => openEntitySheet(entityId),
                      onPrimaryClick: () => openEntitySheet(entityId),
                      children: rowContent,
                    })
                  ) : (
                    <RankingGlobalDesktopRow onOpenSidePanel={() => openEntitySheet(entityId)}>
                      {rowContent}
                    </RankingGlobalDesktopRow>
                  )}
                </div>
              );
            })}
          </div>
          {globalRankingPagination}
        </>
      )}
    </div>
  );

  const myRankingPagination =
    presentation === 'embedded' && showEmbeddedMyPagination ? (
      <RankingBlockGlobalPagination
        pageNumber={embeddedMyPageNumber}
        hasPreviousPage={hasEmbeddedMyPreviousPage}
        hasNextPage={hasEmbeddedMyNextPage}
        onSetPage={setEmbeddedMyPage}
      />
    ) : null;

  const myRankingBody = (
    <div className="flex flex-col gap-4">
      {!draftHydrated ? null : totalMyRankingEntityCount === 0 ? (
        <div className="flex min-h-[120px] items-center rounded-lg bg-grey-01 px-6 py-5">
          <p className="text-metadata text-grey-04">
            Your ranking is empty. Use &ldquo;Add my ranking&rdquo; to pick entries from the filtered list.
          </p>
        </div>
      ) : (
        <>
          <RankingMyRankingDndList
            entityIds={myDisplayEntityIds}
            onReorder={reorderMyRanking}
            disabled={hasMySubmission || showEmbeddedMyPagination || isSharedRankingView}
            onDragStart={() => {
              setActiveSwipeRowKey(null);
              setIsMyRankingDragging(true);
            }}
            onDragEnd={() => setIsMyRankingDragging(false)}
            className="flex flex-col gap-3"
            renderItem={(entityId, index, isDragActive, overlayImageUrl) => {
              const rank = embeddedMyPageNumber * pageSize + index + 1;
              const resolvedEntry = myRankingEntryByEntityId.get(entityId);
              // Mirror the global list: while a row's name is still resolving,
              // show a skeleton rather than flashing "Untitled". On a shared
              // (/r/) shortlink the seed can carry "Untitled" for pending or
              // cross-space entries until the live data lands.
              if (!resolvedEntry || (entriesResolving && isPlaceholderRankingEntry(resolvedEntry))) {
                return (
                  <div className="w-full">
                    <RankingEntryRowSkeleton rank={rank} />
                  </div>
                );
              }
              const entryDisplay = resolvedEntry;
              const rowContent = (
                <RankingEntryRow
                  rank={rank}
                  rankStyle="leading"
                  linkToEntity={false}
                  entry={entryDisplay}
                  spaceId={spaceId}
                  imageUrl={overlayImageUrl}
                  pending={pendingEntityIds.has(entityId)}
                />
              );
              return (
                <div className="w-full">
                  {isMobile ? (
                    wrapMobileSwipeRow({
                      rowKey: `my:${entityId}`,
                      onView: () => openEntitySheet(entityId),
                      primaryDisabled: true,
                      children: rowContent,
                    })
                  ) : (
                    <RankingMyRankingDesktopRow
                      entityName={entryDisplay.name}
                      onOpenSidePanel={() => openEntitySheet(entityId)}
                      hideActions={isDragActive}
                    >
                      {rowContent}
                    </RankingMyRankingDesktopRow>
                  )}
                </div>
              );
            }}
          />
          {myRankingPagination}
        </>
      )}
    </div>
  );

  return (
    <>
      <RankingComposeEntitySheet target={entitySheetTarget} onClose={() => setEntitySheetTarget(null)} />

      {showFirstRankingPrompt ? (
        <RankingFirstSubmissionPrompt action={myRankingActionButton} />
      ) : (
        <>
          {/* The embedded block mirrors the fullscreen page layout: a tab bar on
              every viewport instead of stacked sections. */}
          <div className={cx(presentation === 'fullscreen' && 'flex min-h-0 flex-1 flex-col overflow-hidden')}>
            {showMyRankingTab ? (
              <>
                <div className="relative mb-4 shrink-0">
                  <div className="flex w-full min-w-0 flex-nowrap items-end justify-between gap-3">
                    <div className="relative flex min-w-0 flex-1 items-center gap-6 overflow-hidden pb-2">
                      <RankingTabButton
                        active={activeTab === 'global' || !showMyRankingSection}
                        label="Global ranking"
                        layoutId={`ranking-${presentation}-tab-underline`}
                        onClick={() => setActiveTab('global')}
                      />

                      {showMyRankingSection ? (
                        <RankingTabButton
                          active={activeTab === 'my'}
                          label={myRankingTabLabel}
                          layoutId={`ranking-${presentation}-tab-underline`}
                          onClick={() => setActiveTab('my')}
                        />
                      ) : null}
                    </div>

                    {!movesActionBelowTabs && !showMyTabActionsBelowTabs ? (
                      <div className="mb-2 flex shrink-0 items-center">{myRankingActionButton}</div>
                    ) : null}
                  </div>

                  <div className="absolute right-0 bottom-0 left-0 z-0 h-px bg-grey-02" />
                </div>

                {showMyTabActionsBelowTabs ? (
                  <div className="mb-4 flex w-full shrink-0">{myRankingTabActions}</div>
                ) : movesSharedAddBelowTabs ? (
                  <div className="mb-4 flex shrink-0 justify-start">{myRankingActionButton}</div>
                ) : movesEditBelowTabs && activeTab === 'my' ? (
                  <div className="mb-4 flex shrink-0 justify-end">{buildMobileFullscreenEditButton(state)}</div>
                ) : null}

                <div
                  className={cx(presentation === 'fullscreen' && 'min-h-0 flex-1 overflow-x-hidden overflow-y-auto')}
                >
                  <div className={cx(showMyRankingSection && activeTab === 'my' && 'hidden')}>{globalRankingBody}</div>
                  {showMyRankingSection ? (
                    <div className={cx(activeTab !== 'my' && 'hidden')}>{myRankingBody}</div>
                  ) : null}
                </div>
              </>
            ) : presentation === 'fullscreen' ? (
              <>
                <div className="relative mb-4 shrink-0">
                  <div className="flex w-full min-w-0 flex-nowrap items-end justify-between gap-3">
                    <div className="relative flex min-w-0 flex-1 items-center gap-6 overflow-hidden pb-2">
                      <RankingTabButton
                        active
                        label="Global ranking"
                        layoutId={`ranking-${presentation}-tab-underline`}
                        onClick={() => setActiveTab('global')}
                      />
                    </div>

                    {showAddMyRankingInGlobalHeader ? (
                      <div className="mb-2 flex shrink-0 items-center">{myRankingActionButton}</div>
                    ) : null}
                  </div>

                  <div className="absolute right-0 bottom-0 left-0 z-0 h-px bg-grey-02" />
                </div>

                <div
                  className={cx(presentation === 'fullscreen' && 'min-h-0 flex-1 overflow-x-hidden overflow-y-auto')}
                >
                  {globalRankingBody}
                </div>
              </>
            ) : (
              <section className="mb-4 flex w-full min-w-0 flex-col gap-3">
                <SectionHeader
                  title="Global ranking"
                  action={showAddMyRankingInGlobalHeader ? myRankingActionButton : null}
                />
                <div>{globalRankingBody}</div>
              </section>
            )}
          </div>
        </>
      )}
    </>
  );
}

'use client';

import * as React from 'react';

import { Avatar } from '~/design-system/avatar';
import { Button } from '~/design-system/button';
import { RankingChart } from '~/design-system/icons/ranking-chart';

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
import { RankingContributePointsBanner } from './ranking-contribute-points-banner';
import { RankingEntryRow } from './ranking-entry-row';
import { RankingMyRankingDndList } from './ranking-my-ranking-dnd';
import { RankingAggregatedSubmitterAvatars } from './ranking-period-metadata';
import type { RankingBlockPresentation, RankingBlockState } from './use-ranking-block-state';

type Props = {
  state: RankingBlockState;
  presentation?: RankingBlockPresentation;
};

function buildMobileFullscreenEditButton(state: RankingBlockState) {
  const { isSaving, openRankingCompose } = state;

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

export function RankingBlockBody({ state, presentation = 'embedded' }: Props) {
  const {
    spaceId,
    isMobile,
    showFirstRankingPrompt,
    showMyRankingTab,
    showMyRankingSection,
    showContributePointsBanner,
    showAddMyRankingInGlobalHeader,
    showAggregatedRankingsOnGlobalTab,
    visibleAggregatedSubmitterSpaceIds,
    aggregatedRankingCount,
    myAvatarUrl,
    myAvatarSeed,
    activeTab,
    setActiveTab,
    globalDisplayEntityIds,
    globalEntriesById,
    globalRankByEntityId,
    isLoadingGlobalEntries,
    myDisplayEntityIds,
    myRankingEntryByEntityId,
    draftHydrated,
    hasMySubmission,
    reorderMyRanking,
    openEntitySheet,
    activeSwipeRowKey,
    setActiveSwipeRowKey,
    isMyRankingDragging,
    setIsMyRankingDragging,
    entitySheetTarget,
    setEntitySheetTarget,
  } = state;

  const myRankingActionButton = buildMyRankingActionButton(state);
  const SectionHeader = presentation === 'fullscreen' ? RankingFullscreenSectionHeaderRow : RankingSectionHeaderRow;

  // On mobile fullscreen the action button moves below the My ranking tab as a plain "Edit" button.
  const isFullscreenMobile = presentation === 'fullscreen' && isMobile;
  const movesEditBelowTabs = isFullscreenMobile && showMyRankingSection;

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

  const globalRankingBody = (
    <div className="flex flex-col gap-4">
      {showContributePointsBanner ? <RankingContributePointsBanner /> : null}
      {globalDisplayEntityIds.length === 0 ? (
        <RankingSubmitCtaBanner />
      ) : isLoadingGlobalEntries ? (
        <p className="text-metadata text-grey-03">Loading ranking…</p>
      ) : (
        <div className="flex flex-col gap-3">
          {globalDisplayEntityIds.map(entityId => {
            const entry = globalEntriesById.get(entityId);
            const rank = globalRankByEntityId.get(entityId);
            if (!entry || rank == null) return null;
            const rowContent = (
              <RankingEntryRow
                rank={rank}
                rankStyle="leading"
                entry={entry}
                spaceId={spaceId}
                linkToEntity={!isMobile}
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
      )}
    </div>
  );

  const myRankingBody = (
    <div className="flex flex-col gap-4">
      {!draftHydrated ? (
        <p className="text-metadata text-grey-03">Loading your ranking…</p>
      ) : myDisplayEntityIds.length === 0 ? (
        <div className="flex min-h-[120px] items-center rounded-lg bg-grey-01 px-6 py-5">
          <p className="text-metadata text-grey-04">
            Your ranking is empty. Use &ldquo;Add my ranking&rdquo; to pick entries from the filtered list.
          </p>
        </div>
      ) : (
        <RankingMyRankingDndList
          entityIds={myDisplayEntityIds}
          onReorder={reorderMyRanking}
          disabled={hasMySubmission}
          onDragStart={() => {
            setActiveSwipeRowKey(null);
            setIsMyRankingDragging(true);
          }}
          onDragEnd={() => setIsMyRankingDragging(false)}
          className="flex flex-col"
          renderItem={(entityId, index, isDragActive) => {
            const entryDisplay = myRankingEntryByEntityId.get(entityId) ?? {
              entityId,
              name: 'Untitled',
              description: null,
              image: null,
            };
            const rowContent = (
              <RankingEntryRow
                rank={index + 1}
                rankStyle="leading"
                linkToEntity={false}
                entry={entryDisplay}
                spaceId={spaceId}
              />
            );
            return (
              <div className="w-full py-3">
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
          {presentation !== 'fullscreen' ? (
            <div className="hidden w-full min-w-0 flex-col lg:flex">
              {showMyRankingSection ? (
                <section className="flex w-full min-w-0 flex-col gap-3">
                  <SectionHeader title="My ranking" action={showMyRankingTab ? myRankingActionButton : null} />
                  {myRankingBody}
                </section>
              ) : null}

              {showMyRankingSection ? (
                <div className="my-6 h-px shrink-0 bg-grey-02" role="separator" aria-hidden />
              ) : null}

              <section className="flex w-full min-w-0 flex-col gap-3">
                <SectionHeader
                  title="Global ranking"
                  action={showAddMyRankingInGlobalHeader ? myRankingActionButton : null}
                />
                {globalRankingBody}
              </section>
            </div>
          ) : null}
          <div className={presentation === 'fullscreen' ? undefined : 'lg:hidden'}>
            {showMyRankingTab ? (
              <>
                <div className="relative mb-4">
                  <div className="flex w-full min-w-0 flex-nowrap items-end justify-between gap-3">
                    <div className="relative flex min-w-0 flex-1 items-center gap-6 overflow-hidden pb-2">
                      <RankingTabButton
                        active={activeTab === 'global' || !showMyRankingSection}
                        label={showAggregatedRankingsOnGlobalTab ? '' : 'Global ranking'}
                        ariaLabel={showAggregatedRankingsOnGlobalTab ? 'Global ranking' : undefined}
                        layoutId={`ranking-${presentation}-tab-underline`}
                        onClick={() => setActiveTab('global')}
                      >
                        {showAggregatedRankingsOnGlobalTab ? (
                          <div className="flex items-center gap-2">
                            <RankingAggregatedSubmitterAvatars
                              submitterSpaceIds={visibleAggregatedSubmitterSpaceIds}
                              totalCount={aggregatedRankingCount}
                              maxVisible={3}
                            />
                          </div>
                        ) : null}
                      </RankingTabButton>

                      {showMyRankingSection ? (
                        <RankingTabButton
                          active={activeTab === 'my'}
                          label="My ranking"
                          layoutId={`ranking-${presentation}-tab-underline`}
                          onClick={() => setActiveTab('my')}
                        >
                          <span className="relative h-6 w-6 shrink-0 overflow-hidden rounded-full">
                            <Avatar avatarUrl={myAvatarUrl} value={myAvatarSeed} size={24} />
                          </span>
                        </RankingTabButton>
                      ) : null}
                    </div>

                    {!movesEditBelowTabs ? (
                      <div className="mb-2 flex shrink-0 items-center">{myRankingActionButton}</div>
                    ) : null}
                  </div>

                  <div className="absolute right-0 bottom-0 left-0 z-0 h-px bg-grey-02" />
                </div>

                {movesEditBelowTabs && activeTab === 'my' ? (
                  <div className="mb-4 flex justify-end">{buildMobileFullscreenEditButton(state)}</div>
                ) : null}

                {showMyRankingSection && activeTab === 'my' ? myRankingBody : globalRankingBody}
              </>
            ) : (
              <section className="mb-4 flex w-full min-w-0 flex-col gap-3">
                <SectionHeader
                  title="Global ranking"
                  action={showAddMyRankingInGlobalHeader ? myRankingActionButton : null}
                />
                {globalRankingBody}
              </section>
            )}
          </div>
        </>
      )}
    </>
  );
}

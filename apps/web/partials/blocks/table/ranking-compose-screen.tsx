'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import cx from 'classnames';
import { useSetAtom } from 'jotai';
import { useRouter, useSearchParams } from 'next/navigation';

import { useDataBlock } from '~/core/blocks/data/use-data-block';
import { getRankingPublishSpaceIds } from '~/core/blocks/ranking/ranking-compose-publish-spaces';
import { rankingComposeReturnHref } from '~/core/blocks/ranking/ranking-compose-url';
import {
  formatRankingPeriodLabel,
  getRankingPeriodState,
  rankingSubmissionsOpen,
} from '~/core/blocks/ranking/ranking-period';
import {
  getRowDescription,
  getRowDisplayName,
  splitRankableEntityIds,
} from '~/core/blocks/ranking/ranking-rankable-list';
import { useRankingAccumulatedRows } from '~/core/blocks/ranking/use-ranking-accumulated-rows';
import { useRankingBlockDates } from '~/core/blocks/ranking/use-ranking-block-dates';
import { useRankingBlockRelations } from '~/core/blocks/ranking/use-ranking-block-relations';
import { useRankingEntryEntities } from '~/core/blocks/ranking/use-ranking-entry-entities';
import { useRankingSubmissions } from '~/core/blocks/ranking/use-ranking-submissions';
import { useCreateEntityWithFilters } from '~/core/hooks/use-create-entity-with-filters';
import { useIsMobileLayout } from '~/core/hooks/use-is-mobile-layout';
import { useRankingComposeAccess } from '~/core/hooks/use-ranking-compose-access';

import { Button } from '~/design-system/button';

import { RankingComposeCreateEntityPanel } from './ranking-compose-create-entity-panel';
import { RankingComposeEntitySheet } from './ranking-compose-entity-sheet';
import { RankingComposeFullscreen } from './ranking-compose-fullscreen';
import { RankingComposeGlobalRanking } from './ranking-compose-global-ranking';
import { RankingComposeHeader } from './ranking-compose-header';
import { RankingComposeLayout } from './ranking-compose-layout';
import { RankingComposeMyRanking } from './ranking-compose-my-ranking';
import { rankingComposeCreateEntityAtom } from '~/atoms/ranking-compose-create-entity';

type Props = {
  spaceId: string;
  rankingStartDate?: string;
  rankingEndDate?: string;
};

export function RankingComposeScreen({ spaceId, rankingStartDate = '', rankingEndDate = '' }: Props) {
  const isMobile = useIsMobileLayout();
  const router = useRouter();
  const searchParams = useSearchParams();
  const parentEntityId = searchParams?.get('parentEntityId') ?? '';
  const { name, entityId, rows: _rows, filterState } = useDataBlock();
  const displayName = name?.trim() || 'Untitled ranking';
  const { status: accessStatus, ensureAccess } = useRankingComposeAccess(spaceId);
  const { onClick: createEntityWithFilters } = useCreateEntityWithFilters(spaceId);
  const setCreateEntityFlow = useSetAtom(rankingComposeCreateEntityAtom);

  React.useEffect(() => {
    if (accessStatus === 'ready') return;
    void ensureAccess();
  }, [accessStatus, ensureAccess]);

  const { startDate, endDate } = useRankingBlockDates({ startDate: rankingStartDate, endDate: rankingEndDate });
  const periodState = React.useMemo(() => getRankingPeriodState(startDate, endDate), [startDate, endDate]);
  const periodLabel = React.useMemo(
    () => formatRankingPeriodLabel(periodState, startDate, endDate),
    [periodState, startDate, endDate]
  );
  const submissionsOpen = rankingSubmissionsOpen(periodState);

  const { submissions, mySubmission, saveMySubmission, isSaving, personalSpaceId } = useRankingSubmissions(
    entityId,
    spaceId,
    displayName
  );

  const { globalRankingEntityIds, globalLeaderboard, aggregatedSubmitterSpaceIds, aggregatedRankingCount } =
    useRankingBlockRelations();

  const globalOrderedIds = globalRankingEntityIds;

  const globalRankByEntityId = React.useMemo(
    () => new Map(globalLeaderboard.map(e => [e.entityId, e.rank])),
    [globalLeaderboard]
  );

  const {
    rows: accumulatedRows,
    isLoading: isLoadingRows,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useRankingAccumulatedRows();

  const { rankedEntityIds, unrankedEntityIds } = React.useMemo(
    () => splitRankableEntityIds(globalOrderedIds, accumulatedRows),
    [globalOrderedIds, accumulatedRows]
  );

  const hasRankedGlobalEntities = rankedEntityIds.length > 0;

  const rowsByEntityId = React.useMemo(() => new Map(accumulatedRows.map(r => [r.entityId, r])), [accumulatedRows]);

  const allRankableEntityIds = React.useMemo(
    () => [...rankedEntityIds, ...unrankedEntityIds],
    [rankedEntityIds, unrankedEntityIds]
  );

  const { entries: rankableEntries } = useRankingEntryEntities(spaceId, allRankableEntityIds);
  const rankableEntriesById = React.useMemo(
    () => new Map(rankableEntries.map(e => [e.entityId, e])),
    [rankableEntries]
  );

  const [orderedIds, setOrderedIds] = React.useState<string[]>(mySubmission?.orderedEntityIds ?? []);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isSearchOpen, setIsSearchOpen] = React.useState(false);
  const [activeSwipeRowKey, setActiveSwipeRowKey] = React.useState<string | null>(null);
  const [entitySheetTarget, setEntitySheetTarget] = React.useState<{
    entityId: string;
    spaceId: string;
    previewImageUrl?: string | null;
    previewName?: string | null;
    previewDescription?: string | null;
  } | null>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const matchesSearch = React.useCallback(
    (entityId: string) => {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      const entry = rankableEntriesById.get(entityId);
      const row = rowsByEntityId.get(entityId);
      const label = entry?.name ?? (row ? getRowDisplayName(row) : '');
      return label.toLowerCase().includes(q);
    },
    [searchQuery, rankableEntriesById, rowsByEntityId]
  );

  const filteredRankedIds = React.useMemo(
    () => rankedEntityIds.filter(matchesSearch),
    [rankedEntityIds, matchesSearch]
  );

  const filteredUnrankedIds = React.useMemo(
    () => unrankedEntityIds.filter(matchesSearch),
    [unrankedEntityIds, matchesSearch]
  );

  const showRankedUnrankedDivider = filteredRankedIds.length > 0 && filteredUnrankedIds.length > 0;

  const hasVisibleRankableEntities = filteredRankedIds.length > 0 || filteredUnrankedIds.length > 0;

  const mySubmissionIdsKey = (mySubmission?.orderedEntityIds ?? []).join('|');

  React.useEffect(() => {
    const next = mySubmission?.orderedEntityIds ?? [];
    setOrderedIds(prev => {
      if (prev.length === next.length && prev.every((id, index) => id === next[index])) {
        return prev;
      }
      return next;
    });
  }, [mySubmissionIdsKey]);

  const displayMyEntityIds = orderedIds;

  const { entries: myEntries, isLoading: isLoadingMyEntries } = useRankingEntryEntities(spaceId, displayMyEntityIds);
  const myEntriesById = React.useMemo(() => new Map(myEntries.map(e => [e.entityId, e])), [myEntries]);

  const addToMyRanking = (entityId: string) => {
    setOrderedIds(prev => (prev.includes(entityId) ? prev : [...prev, entityId]));
  };

  const removeFromMyRanking = (entityId: string) => {
    setActiveSwipeRowKey(null);
    setOrderedIds(prev => prev.filter(id => id !== entityId));
  };

  const reorderMyRanking = (nextIds: string[]) => {
    setActiveSwipeRowKey(null);
    setOrderedIds(nextIds);
  };

  const resolveEntitySpaceId = (entityId: string) => {
    const row = rowsByEntityId.get(entityId);
    return row?.columns[SystemIds.NAME_PROPERTY]?.space ?? spaceId;
  };

  const openEntitySheet = (entityId: string) => {
    setCreateEntityFlow(null);
    const entry = myEntriesById.get(entityId) ?? rankableEntriesById.get(entityId);
    const row = rowsByEntityId.get(entityId);
    setEntitySheetTarget({
      entityId,
      spaceId: resolveEntitySpaceId(entityId),
      previewImageUrl: entry?.image ?? row?.columns[SystemIds.NAME_PROPERTY]?.image ?? null,
      previewName: entry?.name ?? (row ? getRowDisplayName(row) : null),
      previewDescription: entry?.description ?? (row ? getRowDescription(row) : null),
    });
  };

  const handleCreateNew = () => {
    const publishSpaceIds = getRankingPublishSpaceIds(filterState, spaceId);
    const publishSpaceId = publishSpaceIds[0] ?? spaceId;
    const draftName = searchQuery.trim();

    const newEntityId = createEntityWithFilters({
      filters: filterState,
      spaceId: publishSpaceId,
      name: draftName || undefined,
    });

    setCreateEntityFlow({
      entityId: newEntityId,
      publishSpaceId,
      publishSpaceIds,
    });
  };

  const canPublish = orderedIds.length > 0 && submissionsOpen && Boolean(personalSpaceId) && !isSaving;

  const handlePublish = async () => {
    const slots = orderedIds.map(id => {
      const row = rowsByEntityId.get(id);
      const entry = rankableEntriesById.get(id);
      return {
        id,
        name: entry?.name ?? (row ? getRowDisplayName(row) : null),
        spaceId: row?.columns[SystemIds.NAME_PROPERTY]?.space ?? spaceId,
      };
    });
    await saveMySubmission(slots);
    if (parentEntityId) {
      router.push(rankingComposeReturnHref(spaceId, parentEntityId));
      return;
    }
    router.back();
  };

  const hasRankedByOthers = globalRankingEntityIds.length > 0 || aggregatedRankingCount > 0;
  const hasPopulatedMyRanking = displayMyEntityIds.length > 0;
  const isEntityPreviewOpen = entitySheetTarget !== null;

  if (accessStatus !== 'ready') {
    return (
      <RankingComposeFullscreen>
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-button text-text">
            {accessStatus === 'needs-login' && 'Log in to create your ranking.'}
            {accessStatus === 'needs-onboarding' && 'Create your account to continue.'}
            {accessStatus === 'needs-membership' && 'Requesting membership to this space…'}
            {accessStatus === 'loading' && 'Loading…'}
          </p>
          <Button variant="ghost" small onClick={() => router.back()}>
            Go back
          </Button>
        </div>
      </RankingComposeFullscreen>
    );
  }

  return (
    <>
      <RankingComposeCreateEntityPanel onFinished={addToMyRanking} />
      <RankingComposeEntitySheet target={entitySheetTarget} onClose={() => setEntitySheetTarget(null)} />
      <RankingComposeFullscreen
        style={{
          display: 'grid',
          gridTemplateRows: 'auto minmax(0, 1fr)',
        }}
      >
        <div className={cx('px-4 py-2', isMobile ? '' : 'mx-auto w-full max-w-[1200px]')}>
          <RankingComposeHeader
            isMobile={isMobile}
            displayName={displayName}
            periodState={periodState}
            periodLabel={periodLabel}
            hasRankedByOthers={hasRankedByOthers}
            submissions={submissions}
            aggregatedSubmitterSpaceIds={aggregatedSubmitterSpaceIds}
            aggregatedRankingCount={aggregatedRankingCount}
            onBack={() => router.back()}
            showPublishButton={!isEntityPreviewOpen}
            canPublish={canPublish}
            isSaving={isSaving}
            onPublish={() => void handlePublish()}
          />
        </div>

        <div
          className={cx(
            'relative flex h-full min-h-0 flex-col overflow-hidden px-4',
            isMobile ? '' : 'mx-auto w-full max-w-[1200px]'
          )}
        >
          <RankingComposeLayout
            isMobile={isMobile}
            myRanking={
              <RankingComposeMyRanking
                isMobile={isMobile}
                spaceId={spaceId}
                displayEntityIds={displayMyEntityIds}
                isLoading={isLoadingMyEntries}
                entriesById={myEntriesById}
                rowsByEntityId={rowsByEntityId}
                canPublish={canPublish}
                isSaving={isSaving}
                hidePublishButton={isEntityPreviewOpen}
                activeSwipeRowKey={activeSwipeRowKey}
                onActiveSwipeRowKeyChange={setActiveSwipeRowKey}
                onPublish={() => void handlePublish()}
                onReorder={reorderMyRanking}
                onRemove={removeFromMyRanking}
                onView={openEntitySheet}
              />
            }
            globalRanking={
              <RankingComposeGlobalRanking
                isMobile={isMobile}
                spaceId={spaceId}
                orderedIds={orderedIds}
                filteredRankedIds={filteredRankedIds}
                filteredUnrankedIds={filteredUnrankedIds}
                globalRankByEntityId={globalRankByEntityId}
                rankableEntriesById={rankableEntriesById}
                rowsByEntityId={rowsByEntityId}
                showRankedUnrankedDivider={showRankedUnrankedDivider}
                hasVisibleRankableEntities={hasVisibleRankableEntities}
                hasPopulatedMyRanking={hasPopulatedMyRanking}
                isLoadingRows={isLoadingRows && !hasRankedGlobalEntities}
                isFetchingNextPage={isFetchingNextPage}
                hasNextPage={hasNextPage}
                hasAnyRankableEntityIds={hasRankedGlobalEntities || unrankedEntityIds.length > 0 || isLoadingRows}
                onFetchNextPage={fetchNextPage}
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                isSearchOpen={isSearchOpen}
                onSearchOpenChange={setIsSearchOpen}
                searchInputRef={searchInputRef}
                onAddToMyRanking={addToMyRanking}
                onCreateNew={handleCreateNew}
                activeSwipeRowKey={activeSwipeRowKey}
                onActiveSwipeRowKeyChange={setActiveSwipeRowKey}
                onViewEntity={openEntitySheet}
              />
            }
          />
        </div>
      </RankingComposeFullscreen>
    </>
  );
}

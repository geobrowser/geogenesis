'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { useAtom, useSetAtom } from 'jotai';
import { useRouter, useSearchParams } from 'next/navigation';

import { useDataBlock } from '~/core/blocks/data/use-data-block';
import { resolveRankingSingleTargetSpaceId } from '~/core/blocks/ranking/ranking-compose-publish-spaces';
import { RANKING_COMPOSE_TAB_MY, rankingComposeHref } from '~/core/blocks/ranking/ranking-compose-url';
import { generatePersonalRankingOgImages } from '~/core/blocks/ranking/ranking-og-generate-client';
import { buildRankingOgVersion } from '~/core/blocks/ranking/ranking-og-version';
import {
  getPendingProposerSpaceIds,
  isPlaceholderRankingEntry,
} from '~/core/blocks/ranking/ranking-pending-proposal-entries';
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
import { useRankingComposeSearch } from '~/core/blocks/ranking/use-ranking-compose-search';
import { useRankingEntryEntities } from '~/core/blocks/ranking/use-ranking-entry-entities';
import { useRankingPendingEntities } from '~/core/blocks/ranking/use-ranking-pending-proposals';
import { useRankingSubmissions } from '~/core/blocks/ranking/use-ranking-submissions';
import { useCreateEntityWithFilters } from '~/core/hooks/use-create-entity-with-filters';
import { useIsMobileLayout } from '~/core/hooks/use-is-mobile-layout';
import { useOnboarding } from '~/core/hooks/use-onboarding';
import { useRankingComposeAccess } from '~/core/hooks/use-ranking-compose-access';
import { ID } from '~/core/id';
import type { SearchResult } from '~/core/types';

import { stepAtom } from '~/partials/onboarding/dialog';

import { RankingComposeCreateEntityPanel } from './ranking-compose-create-entity-panel';
import { RankingComposeEntitySheet } from './ranking-compose-entity-sheet';
import { RankingComposeFullscreen } from './ranking-compose-fullscreen';
import { RankingComposeGlobalRanking } from './ranking-compose-global-ranking';
import { RankingComposePinnedToolbar, RankingComposeTitleMetadata } from './ranking-compose-header';
import { RankingComposeLayout } from './ranking-compose-layout';
import { RankingComposeMyRanking } from './ranking-compose-my-ranking';
import Custom404 from '~/app/not-found';
import { postOnboardingRedirectAtom } from '~/atoms/post-onboarding-redirect';
import { rankingComposeCreateEntityAtom } from '~/atoms/ranking-compose-create-entity';
import { rankingComposeReturnHrefAtom } from '~/atoms/ranking-compose-return';

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
  const relationId = searchParams?.get('relationId') ?? '';
  const { name, entityId, filterState } = useDataBlock();
  const displayName = name?.trim() || 'Untitled ranking';

  const createNewSpaceId = React.useMemo(() => resolveRankingSingleTargetSpaceId(filterState), [filterState]);

  const { showOnboarding } = useOnboarding();
  const composeAccessSpaceId = createNewSpaceId ?? spaceId;
  const {
    status: accessStatus,
    canEdit: canEditCreateSpace,
    isLoading: isLoadingCreateAccess,
    ensureAccess,
    recheckAccess,
  } = useRankingComposeAccess(composeAccessSpaceId);

  // Member of the target space
  const { onClick: createEntityWithFilters } = useCreateEntityWithFilters(spaceId);
  const setCreateEntityFlow = useSetAtom(rankingComposeCreateEntityAtom);
  const setPostOnboardingRedirect = useSetAtom(postOnboardingRedirectAtom);
  const [rankingComposeReturnHref, setRankingComposeReturnHref] = useAtom(rankingComposeReturnHrefAtom);
  const setStep = useSetAtom(stepAtom);

  const handleBack = React.useCallback(() => {
    if (rankingComposeReturnHref) {
      setRankingComposeReturnHref(null);
      router.replace(rankingComposeReturnHref);
      return;
    }

    router.back();
  }, [rankingComposeReturnHref, router, setRankingComposeReturnHref]);

  React.useEffect(() => {
    if (accessStatus === 'ready' || accessStatus === 'not-found') return;
    // If log-in/sign-up is needed, come back to this compose screen
    if (accessStatus === 'needs-login' || accessStatus === 'needs-onboarding') {
      setPostOnboardingRedirect(window.location.pathname + window.location.search);
    }
    if (accessStatus === 'needs-onboarding') {
      showOnboarding();
      setStep('enter-profile');
    }
    if (accessStatus === 'needs-membership') {
      void ensureAccess();
    }
  }, [accessStatus, ensureAccess, setPostOnboardingRedirect, setStep, showOnboarding]);

  const { startDate, endDate } = useRankingBlockDates({ startDate: rankingStartDate, endDate: rankingEndDate });
  const periodState = React.useMemo(() => getRankingPeriodState(startDate, endDate), [startDate, endDate]);
  const periodLabel = React.useMemo(
    () => formatRankingPeriodLabel(periodState, startDate, endDate),
    [periodState, startDate, endDate]
  );
  const submissionsOpen = rankingSubmissionsOpen(periodState);

  const {
    submissions,
    mySubmission,
    saveMySubmission,
    isSaving,
    personalSpaceId,
    isLoading: isLoadingMySubmission,
  } = useRankingSubmissions(entityId, spaceId, displayName);

  const canCreateNew = Boolean(createNewSpaceId) && !isLoadingCreateAccess && canEditCreateSpace;

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

  const { entries: rankableEntries, isLoading: isLoadingRankableEntries } = useRankingEntryEntities(
    spaceId,
    allRankableEntityIds
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
  const mobilePageScrollRef = React.useRef<HTMLDivElement>(null);

  const myRankingIdSet = React.useMemo(() => new Set(orderedIds.map(id => ID.uuidToHex(id))), [orderedIds]);

  const isSearchActive = searchQuery.trim().length > 0;

  const {
    results: searchResults,
    isLoading: isLoadingSearch,
    isSettled: isSearchSettled,
    isDebouncingAfterEmptySearch,
    isFetchingNextPage: isFetchingNextSearchPage,
    hasNextPage: hasNextSearchPage,
    fetchNextPage: fetchNextSearchPage,
  } = useRankingComposeSearch({
    filterState,
    query: searchQuery,
    enabled: isSearchActive,
  });

  const searchResultsById = React.useMemo(
    () => new Map(searchResults.map(result => [result.id, result])),
    [searchResults]
  );

  const browseRankedIds = React.useMemo(
    () => rankedEntityIds.filter(id => !myRankingIdSet.has(ID.uuidToHex(id))),
    [rankedEntityIds, myRankingIdSet]
  );

  const browseUnrankedIds = React.useMemo(
    () => unrankedEntityIds.filter(id => !myRankingIdSet.has(ID.uuidToHex(id))),
    [unrankedEntityIds, myRankingIdSet]
  );

  const searchEntityIds = React.useMemo(
    () => searchResults.map(result => result.id).filter(id => !myRankingIdSet.has(ID.uuidToHex(id))),
    [searchResults, myRankingIdSet]
  );

  const { searchRankedIds, searchUnrankedIds } = React.useMemo(() => {
    const ranked: string[] = [];
    const unranked: string[] = [];
    for (const id of searchEntityIds) {
      if (globalRankByEntityId.has(id)) ranked.push(id);
      else unranked.push(id);
    }
    const order = searchResults.map(result => result.id);
    const sortBySearchOrder = (ids: string[]) => [...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    return {
      searchRankedIds: sortBySearchOrder(ranked),
      searchUnrankedIds: sortBySearchOrder(unranked),
    };
  }, [searchEntityIds, globalRankByEntityId, searchResults]);

  const filteredRankedIds = isSearchActive ? searchRankedIds : browseRankedIds;
  const filteredUnrankedIds = isSearchActive ? searchUnrankedIds : browseUnrankedIds;

  const { entries: searchEntries } = useRankingEntryEntities(spaceId, isSearchActive ? searchEntityIds : []);

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

  const { entries: myEntries } = useRankingEntryEntities(spaceId, displayMyEntityIds);
  const myEntriesById = React.useMemo(() => new Map(myEntries.map(e => [e.entityId, e])), [myEntries]);

  const rankableEntriesByIdRaw = React.useMemo(() => new Map(rankableEntries.map(e => [e.entityId, e])), [rankableEntries]);

  // Until entity entries have resolved, every id looks like a placeholder
  // (`isPlaceholderRankingEntry(undefined)` is `true`), which would fire the
  // pending-proposal lookup against the full list on initial load. Hold the
  // unresolved set empty while loading so only genuinely-unresolved ids remain.
  const globalUnresolvedIds = React.useMemo(
    () =>
      isLoadingRankableEntries
        ? []
        : allRankableEntityIds.filter(id => id && isPlaceholderRankingEntry(rankableEntriesByIdRaw.get(id))),
    [isLoadingRankableEntries, allRankableEntityIds, rankableEntriesByIdRaw]
  );

  const pendingCandidateEntityIds = React.useMemo(
    () => [...new Set([...orderedIds, ...globalUnresolvedIds].filter(Boolean))],
    [orderedIds, globalUnresolvedIds]
  );

  const pendingProposerSpaceIds = React.useMemo(
    () =>
      getPendingProposerSpaceIds(
        globalUnresolvedIds.length > 0 ? aggregatedSubmitterSpaceIds : [],
        personalSpaceId ? [personalSpaceId] : []
      ),
    [globalUnresolvedIds, aggregatedSubmitterSpaceIds, personalSpaceId]
  );

  const { pendingEntityIds, pendingEntriesByEntityId } = useRankingPendingEntities({
    targetSpaceId: createNewSpaceId,
    unresolvedEntityIds: pendingCandidateEntityIds,
    proposerSpaceIds: pendingProposerSpaceIds,
  });

  const rankableEntriesById = React.useMemo(() => {
    const map = new Map(rankableEntries.map(e => [e.entityId, e]));
    // Pending names override a missing/"Untitled" base entry, never a real one.
    for (const [entityId, entry] of pendingEntriesByEntityId) {
      if (isPlaceholderRankingEntry(map.get(entityId))) map.set(entityId, entry);
    }
    return map;
  }, [rankableEntries, pendingEntriesByEntityId]);

  const displayRankableEntriesById = React.useMemo(() => {
    const map = new Map(rankableEntriesById);
    for (const entry of searchEntries) {
      map.set(entry.entityId, entry);
    }
    return map;
  }, [rankableEntriesById, searchEntries]);

  const myRankingEntriesById = React.useMemo(() => {
    const map = new Map(myEntriesById);
    for (const id of displayMyEntityIds) {
      const entry = displayRankableEntriesById.get(id);
      if (entry) map.set(id, entry);
    }
    return map;
  }, [myEntriesById, displayRankableEntriesById, displayMyEntityIds]);

  // An id is "display-named" when something we can actually render — the resolved
  // entry, the data-block row, or a search hit — yields a real name. Entries and
  // rows both fall back to "Untitled" before they resolve, so checking only the
  // entry isn't enough.
  const isDisplayNamed = React.useCallback(
    (id: string) => {
      const entry = displayRankableEntriesById.get(id);
      if (entry && !isPlaceholderRankingEntry(entry)) return true;
      const row = rowsByEntityId.get(id);
      if (row) {
        const rowName = getRowDisplayName(row).trim();
        if (rowName && rowName !== 'Untitled') return true;
      }
      return Boolean(searchResultsById.get(id)?.name?.trim());
    },
    [displayRankableEntriesById, rowsByEntityId, searchResultsById]
  );

  // Entities hidden from the main global list:
  //   • confirmed-pending ones (shown in the "Show pending" disclosure instead),
  //   • still-unresolved placeholders whose pending status isn't known yet, and
  //   • anything we can't name yet — rendering it would flash "Untitled" on a
  //     throttled refresh until its entry/row resolves; it reappears once named.
  // While the viewer's own submission is still loading we also withhold the
  // browse leaderboard: those entries belong in "My ranking" once `orderedIds`
  // arrives, and showing them here first makes them visibly jump across. This
  // only applies to browse — in search mode `filteredRankedIds` is the search
  // result set, which must stay visible (hiding it would flash "no results").
  const hideRankedForSubmission = isLoadingMySubmission && !isSearchActive;
  const hiddenGlobalIds = React.useMemo(() => {
    const hidden = new Set<string>(pendingEntityIds);
    for (const id of globalUnresolvedIds) hidden.add(id);
    for (const id of filteredRankedIds) {
      if (hideRankedForSubmission || !isDisplayNamed(id)) hidden.add(id);
    }
    for (const id of filteredUnrankedIds) {
      if (!isDisplayNamed(id)) hidden.add(id);
    }
    return hidden;
  }, [
    pendingEntityIds,
    globalUnresolvedIds,
    filteredRankedIds,
    filteredUnrankedIds,
    hideRankedForSubmission,
    isDisplayNamed,
  ]);

  const visibleFilteredRankedIds = React.useMemo(
    () => (hiddenGlobalIds.size === 0 ? filteredRankedIds : filteredRankedIds.filter(id => !hiddenGlobalIds.has(id))),
    [filteredRankedIds, hiddenGlobalIds]
  );
  const visibleFilteredUnrankedIds = React.useMemo(
    () =>
      hiddenGlobalIds.size === 0 ? filteredUnrankedIds : filteredUnrankedIds.filter(id => !hiddenGlobalIds.has(id)),
    [filteredUnrankedIds, hiddenGlobalIds]
  );
  const visibleShowRankedUnrankedDivider = visibleFilteredRankedIds.length > 0 && visibleFilteredUnrankedIds.length > 0;
  const visibleHasVisibleRankableEntities =
    visibleFilteredRankedIds.length > 0 || visibleFilteredUnrankedIds.length > 0;

  const visibleGlobalRankByEntityId = React.useMemo(() => {
    if (hiddenGlobalIds.size === 0) return globalRankByEntityId;
    const visible = globalOrderedIds.filter(id => !hiddenGlobalIds.has(id));
    return new Map(visible.map((id, index) => [id, index + 1]));
  }, [globalOrderedIds, hiddenGlobalIds, globalRankByEntityId]);

  const revealablePendingIds = React.useMemo(
    () => [...pendingEntityIds].filter(id => !myRankingIdSet.has(ID.uuidToHex(id))),
    [pendingEntityIds, myRankingIdSet]
  );

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

  const getSearchResultPreview = (searchHit: SearchResult | undefined) => ({
    name: searchHit?.name?.trim() || null,
    description: searchHit?.description?.trim() || null,
    image: null,
    spaceId: searchHit?.spaces[0]?.spaceId ?? null,
  });

  const resolveEntitySpaceId = (entityId: string): string => {
    const row = rowsByEntityId.get(entityId);
    const rowSpaceId = row?.columns[SystemIds.NAME_PROPERTY]?.space;
    if (rowSpaceId) return rowSpaceId;
    const searchPreview = getSearchResultPreview(searchResultsById.get(entityId));
    return searchPreview.spaceId ?? spaceId;
  };

  const openEntitySheet = (entityId: string) => {
    setCreateEntityFlow(null);
    const entry = myEntriesById.get(entityId) ?? displayRankableEntriesById.get(entityId);
    const row = rowsByEntityId.get(entityId);
    const searchPreview = getSearchResultPreview(searchResultsById.get(entityId));
    setEntitySheetTarget({
      entityId,
      spaceId: resolveEntitySpaceId(entityId),
      previewImageUrl: entry?.image ?? row?.columns[SystemIds.NAME_PROPERTY]?.image ?? searchPreview.image,
      previewName: entry?.name ?? (row ? getRowDisplayName(row) : searchPreview.name),
      previewDescription: entry?.description ?? (row ? getRowDescription(row) : searchPreview.description),
    });
  };

  const handleCreateNew = () => {
    if (!createNewSpaceId) return;

    const draftName = searchQuery.trim();

    const newEntityId = createEntityWithFilters({
      filters: filterState,
      spaceId: createNewSpaceId,
      name: draftName || undefined,
    });

    setCreateEntityFlow({
      entityId: newEntityId,
      publishSpaceId: createNewSpaceId,
      publishSpaceIds: [createNewSpaceId],
    });
  };

  const publishedIdsKey = (mySubmission?.orderedEntityIds ?? []).map(id => ID.uuidToHex(id)).join('|');
  const draftIdsKey = orderedIds.map(id => ID.uuidToHex(id)).join('|');
  const hasUnpublishedChanges = draftIdsKey !== publishedIdsKey;

  const canPublish =
    orderedIds.length > 0 && hasUnpublishedChanges && submissionsOpen && Boolean(personalSpaceId) && !isSaving;

  const handlePublish = async () => {
    const slots = orderedIds.map(id => {
      const row = rowsByEntityId.get(id);
      const entry = displayRankableEntriesById.get(id) ?? myEntriesById.get(id);
      const searchPreview = getSearchResultPreview(searchResultsById.get(id));
      return {
        id,
        name: entry?.name ?? (row ? getRowDisplayName(row) : searchPreview.name),
        spaceId: row?.columns[SystemIds.NAME_PROPERTY]?.space ?? searchPreview.spaceId ?? spaceId,
      };
    });
    const published = await saveMySubmission(slots);
    if (!published) return;

    const ogVersion = buildRankingOgVersion({
      rankEntityId: published.rankEntityId,
      orderedEntityIds: published.orderedEntityIds,
      rankingName: displayName,
      rankingStartDate,
      rankingEndDate,
      authorName: published.authorName,
      authorAvatarUrl: published.authorAvatarUrl,
    });
    void generatePersonalRankingOgImages({
      rankEntityId: published.rankEntityId,
      authorSpaceId: published.authorSpaceId,
      blockEntityId: entityId,
      blockEntitySpaceId: spaceId,
      rankingStartDate,
      rankingEndDate,
      ogVersion,
    });

    // After publishing, land on the fullscreen ranking view instead of the parent space page.
    setRankingComposeReturnHref(null);
    router.replace(
      rankingComposeHref({
        spaceId,
        blockEntityId: entityId,
        relationId,
        parentEntityId,
        rankingStartDate,
        rankingEndDate,
        mode: 'view',
        tab: RANKING_COMPOSE_TAB_MY,
        rankEntityId: published.rankEntityId,
        authorSpaceId: published.authorSpaceId,
        ogVersion,
      })
    );
  };

  const hasRankedByOthers = globalRankingEntityIds.length > 0 || aggregatedRankingCount > 0;
  const isEntityPreviewOpen = entitySheetTarget !== null;

  const isAwaitingMembership = Boolean(createNewSpaceId) && accessStatus === 'needs-membership';

  // The global list isn't ready to render real rows until both the viewer's own
  // submission (so we know which entries are theirs) and the rankable entries (so
  // rows have names) have resolved. Surface this as a loading state so the global
  // column shows its skeleton during a throttled refresh instead of flashing
  // "Untitled" rows that then jump into "My ranking".
  const isGlobalListResolving = isLoadingMySubmission || isLoadingRankableEntries;

  const titleMetadata = (
    <RankingComposeTitleMetadata
      isMobile={isMobile}
      displayName={displayName}
      showMetadata={!isMobile}
      periodState={periodState}
      periodLabel={periodLabel}
      hasRankedByOthers={hasRankedByOthers}
      submissions={submissions}
      aggregatedSubmitterSpaceIds={aggregatedSubmitterSpaceIds}
      aggregatedRankingCount={aggregatedRankingCount}
    />
  );

  const rankingLayout = (
    <RankingComposeLayout
      isMobile={isMobile}
      mobilePageScrollRef={isMobile ? mobilePageScrollRef : undefined}
      myRanking={
        <RankingComposeMyRanking
          isMobile={isMobile}
          spaceId={spaceId}
          displayEntityIds={displayMyEntityIds}
          entriesById={myRankingEntriesById}
          searchResultsById={searchResultsById}
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
          pendingEntityIds={pendingEntityIds}
        />
      }
      globalRanking={
        <RankingComposeGlobalRanking
          isMobile={isMobile}
          spaceId={spaceId}
          orderedIds={orderedIds}
          filteredRankedIds={visibleFilteredRankedIds}
          filteredUnrankedIds={visibleFilteredUnrankedIds}
          globalRankByEntityId={visibleGlobalRankByEntityId}
          rankableEntriesById={displayRankableEntriesById}
          searchResultsById={searchResultsById}
          rowsByEntityId={rowsByEntityId}
          showRankedUnrankedDivider={visibleShowRankedUnrankedDivider}
          hasVisibleRankableEntities={visibleHasVisibleRankableEntities}
          isSearchActive={isSearchActive}
          isSearchSettled={isSearchSettled}
          isDebouncingAfterEmptySearch={isDebouncingAfterEmptySearch}
          isLoadingRows={
            isSearchActive ? isLoadingSearch : isGlobalListResolving || (isLoadingRows && !hasRankedGlobalEntities)
          }
          isFetchingNextPage={isSearchActive ? isFetchingNextSearchPage : isFetchingNextPage}
          hasNextPage={isSearchActive ? hasNextSearchPage : hasNextPage}
          hasAnyRankableEntityIds={
            !isGlobalListResolving && (hasRankedGlobalEntities || unrankedEntityIds.length > 0 || isLoadingRows)
          }
          onFetchNextPage={isSearchActive ? fetchNextSearchPage : fetchNextPage}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          isSearchOpen={isSearchOpen}
          onSearchOpenChange={setIsSearchOpen}
          searchInputRef={searchInputRef}
          onAddToMyRanking={addToMyRanking}
          onCreateNew={handleCreateNew}
          canCreateNew={canCreateNew}
          isAwaitingMembership={isAwaitingMembership}
          onRecheckMembership={recheckAccess}
          pendingEntityIds={pendingEntityIds}
          revealablePendingIds={revealablePendingIds}
          activeSwipeRowKey={activeSwipeRowKey}
          onActiveSwipeRowKeyChange={setActiveSwipeRowKey}
          onViewEntity={openEntitySheet}
        />
      }
    />
  );

  if (accessStatus === 'not-found') {
    return <Custom404 />;
  }

  return (
    <>
      <RankingComposeCreateEntityPanel onFinished={addToMyRanking} rankingName={displayName} />
      <RankingComposeEntitySheet target={entitySheetTarget} onClose={() => setEntitySheetTarget(null)} />
      <RankingComposeFullscreen coverNavbar={isMobile}>
        {isMobile ? (
          <>
            <div className="shrink-0 bg-white px-4 py-2">
              <RankingComposePinnedToolbar
                isMobile={isMobile}
                onBack={handleBack}
                showPublishButton
                canPublish={canPublish}
                isSaving={isSaving}
                onPublish={() => void handlePublish()}
              />
            </div>

            <div
              ref={mobilePageScrollRef}
              data-ranking-compose-mobile-scroll=""
              data-app-scroll-surface
              className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4"
            >
              <div className="pt-2 pb-4">{titleMetadata}</div>
              <div className="relative flex min-h-0 flex-col">{rankingLayout}</div>
            </div>
          </>
        ) : (
          <div className="mx-auto flex h-full min-h-0 w-full max-w-[1200px] flex-col overflow-hidden px-4">
            <div className="shrink-0 py-2">
              <RankingComposePinnedToolbar
                isMobile={isMobile}
                onBack={handleBack}
                showPublishButton={false}
                canPublish={canPublish}
                isSaving={isSaving}
                onPublish={() => void handlePublish()}
              />
              <div className="mt-3 pb-4">{titleMetadata}</div>
            </div>

            <div className="relative min-h-0 flex-1">{rankingLayout}</div>
          </div>
        )}
      </RankingComposeFullscreen>
    </>
  );
}

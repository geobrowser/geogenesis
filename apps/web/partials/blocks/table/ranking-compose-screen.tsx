'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import cx from 'classnames';
import { useAtom, useSetAtom } from 'jotai';
import { useRouter, useSearchParams } from 'next/navigation';

import { useDataBlock } from '~/core/blocks/data/use-data-block';
import {
  BEST_DEBATES_GRADE_PARAM,
  BEST_DEBATES_GRADE_TIERS,
  BEST_DEBATES_TEAM_VIEW_PARAM,
  BEST_DEBATES_TEAM_VIEW_TO_RANK,
} from '~/core/blocks/ranking/best-debates-views';
import { RankingComposeBallotContext, useComposeBallot } from '~/core/blocks/ranking/ranking-compose-ballot-context';
import { resolveRankingSingleTargetSpaceId } from '~/core/blocks/ranking/ranking-compose-publish-spaces';
import { RANKING_COMPOSE_TAB_MY, rankingComposeHref } from '~/core/blocks/ranking/ranking-compose-url';
import { countBallotChanges, unpublishedChangesLabel } from '~/core/blocks/ranking/ranking-draft-changes';
import {
  GRADE_YOUR_RANKING_TITLE,
  type Grade,
  NO_GRADES,
  TIER_LINES_AUTO_OPEN_MIN,
  TIER_LINES_NOT_NOW_LABEL,
  TIER_LINES_SAVE_LABEL,
  applyTierLines,
  defaultTierLines,
  gradeInto,
  gradeOf,
  hasAnyGrade,
  removeEntry,
  restoreEntry,
  sameGrades,
  tierSections,
} from '~/core/blocks/ranking/ranking-grades';
import { generatePersonalRankingOgImages } from '~/core/blocks/ranking/ranking-og-generate-client';
import { buildRankingOgVersion } from '~/core/blocks/ranking/ranking-og-version';
import {
  getPendingProposerSpaceIds,
  isPlaceholderRankingEntry,
} from '~/core/blocks/ranking/ranking-pending-proposal-entries';
import { getRankingPeriodState, rankingSubmissionsOpen } from '~/core/blocks/ranking/ranking-period';
import {
  getRowDescription,
  getRowDisplayName,
  splitRankableEntityIds,
} from '~/core/blocks/ranking/ranking-rankable-list';
import type { RankingSubmissionSlot } from '~/core/blocks/ranking/ranking-submission-types';
import { useBestDebateDisplays } from '~/core/blocks/ranking/use-best-debate-displays';
import { useComposeEditGuard } from '~/core/blocks/ranking/use-compose-edit-guard';
import {
  useBestDebatesBallotPublisher,
  useMyPushedDownDebates,
} from '~/core/blocks/ranking/use-my-pushed-down-debates';
import { useRankingAccumulatedRows } from '~/core/blocks/ranking/use-ranking-accumulated-rows';
import { useRankingBlockDates } from '~/core/blocks/ranking/use-ranking-block-dates';
import { useRankingBlockRelations } from '~/core/blocks/ranking/use-ranking-block-relations';
import { useRankingComposeSearch } from '~/core/blocks/ranking/use-ranking-compose-search';
import { useRankingEntryEntities } from '~/core/blocks/ranking/use-ranking-entry-entities';
import { useRankingPendingEntities } from '~/core/blocks/ranking/use-ranking-pending-proposals';
import { useRankingPeriod } from '~/core/blocks/ranking/use-ranking-period';
import {
  type RankingSubmissionPublishResult,
  useRankingSubmissions,
} from '~/core/blocks/ranking/use-ranking-submissions';
import { useCreateEntityWithFilters } from '~/core/hooks/use-create-entity-with-filters';
import { useIsMobileLayout } from '~/core/hooks/use-is-mobile-layout';
import { useOnboarding } from '~/core/hooks/use-onboarding';
import { rankingComposeNeedsAccountStep, useRankingComposeAccess } from '~/core/hooks/use-ranking-compose-access';
import { useToast } from '~/core/hooks/use-toast';
import { ID } from '~/core/id';
import { useEnqueuePendingAction } from '~/core/state/pending-actions';
import { usePendingPersonalSpace } from '~/core/state/pending-personal-space';
import type { SearchResult } from '~/core/types';
import { useRankingOpportunity } from '~/core/use-ranking-opportunity';

import { Button } from '~/design-system/button';

import { stepAtom } from '~/partials/onboarding/onboarding-atoms';

import {
  type BestDebatesGrading,
  type GradeChange,
  gradeChanges,
  reorderGradeChanges,
  useRecordGrade,
} from './best-debates/best-debate-grading';
import { BestDebateDisplaysContext } from './best-debates/best-debate-row';
import { BestDebateWatchProvider } from './best-debates/best-debate-watch';
import { BestDebatesTierHeader } from './best-debates/best-debates-tier-header';
import { ClearRankingButton } from './best-debates/clear-ranking-button';
import { CopyTeamRankingStart } from './best-debates/copy-team-ranking-start';
import { useBestDebatesCompose } from './best-debates/use-best-debates-compose';
import { useBestDebatesPushDownSlot } from './best-debates/use-best-debates-push-down-slot';
import { useUnpublishedLeaveGuard } from './best-debates/use-unpublished-leave-guard';
import { RankingBallotReadError } from './ranking-ballot-read-error';
import { RankingComposeCreateEntityPanel } from './ranking-compose-create-entity-panel';
import { RankingComposeEntitySheet } from './ranking-compose-entity-sheet';
import { RankingComposeFullscreen } from './ranking-compose-fullscreen';
import { RankingComposeGlobalRanking } from './ranking-compose-global-ranking';
import {
  RANKING_COMPOSE_PUBLISH_BUTTON_CLASS,
  RankingComposePinnedToolbar,
  RankingComposeTitleMetadata,
} from './ranking-compose-header';
import { RankingComposeLayout } from './ranking-compose-layout';
import { RankingComposeMyRanking } from './ranking-compose-my-ranking';
import { RankingComposePushedDown } from './ranking-compose-pushed-down';
import { rankingComposeSeed, useRankingComposeDraft } from './use-ranking-compose-draft';
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

  // Best debates (GEO-3677): composing needs Debates membership. A
  // pasted compose URL lands here without the block's buttons, so the screen checks it too: no
  // membership request, and once that's settled, the read-only view.
  const composeEditGuard = useComposeEditGuard({ blockId: entityId, spaceId });
  const composeEditRefused = composeEditGuard.isBestDebates && !composeEditGuard.allowed;
  // Best debates (GEO-3678/3679) adds To rank, placing by comparison, push down, drag-in and phone
  // tabs, only for whoever may compose there. Every other ranking block gets the screen as before.
  // Until the guard settles (hydrating, membership loading) the screen shows a loading state:
  // the generic screen would flash, and could file items under the block's space.
  const isBestDebates = composeEditGuard.isBestDebates && composeEditGuard.allowed;
  const isBestDebatesLoading = composeEditGuard.isBestDebates && !composeEditGuard.settled;
  const bestDebatesBlockId = isBestDebates ? entityId : null;

  const createNewSpaceId = React.useMemo(() => resolveRankingSingleTargetSpaceId(filterState), [filterState]);

  const { showOnboarding } = useOnboarding();
  const [, setToast] = useToast();
  const composeAccessSpaceId = createNewSpaceId ?? spaceId;
  const {
    status: accessStatus,
    canEdit: canEditCreateSpace,
    isLoading: isLoadingCreateAccess,
    ensureAccess,
    recheckAccess,
  } = useRankingComposeAccess(composeAccessSpaceId, entityId);

  // Member of the target space
  const { onClick: createEntityWithFilters } = useCreateEntityWithFilters(spaceId);
  const setCreateEntityFlow = useSetAtom(rankingComposeCreateEntityAtom);
  const setPostOnboardingRedirect = useSetAtom(postOnboardingRedirectAtom);
  const [rankingComposeReturnHref, setRankingComposeReturnHref] = useAtom(rankingComposeReturnHrefAtom);
  const setStep = useSetAtom(stepAtom);
  const enqueuePendingAction = useEnqueuePendingAction('ranking_composer');
  const { isPending: isAccountSetupPending } = usePendingPersonalSpace();

  const handleBackNow = React.useCallback(() => {
    if (rankingComposeReturnHref) {
      setRankingComposeReturnHref(null);
      router.replace(rankingComposeReturnHref);
      return;
    }

    router.back();
  }, [rankingComposeReturnHref, router, setRankingComposeReturnHref]);
  const handleBackRef = React.useRef<() => void>(handleBackNow);
  const handleBack = React.useCallback(() => handleBackRef.current(), []);

  React.useEffect(() => {
    if (!composeEditRefused || !composeEditGuard.settled) return;
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('mode', 'view');
    router.replace(`${window.location.pathname}?${params.toString()}`);
  }, [composeEditGuard.settled, composeEditRefused, router, searchParams]);

  React.useEffect(() => {
    if (composeEditRefused) return;
    if (accessStatus === 'ready' || accessStatus === 'not-found') return;
    // If log-in/sign-up is needed, come back to this compose screen
    if (rankingComposeNeedsAccountStep(accessStatus, isAccountSetupPending)) {
      setPostOnboardingRedirect(window.location.pathname + window.location.search);
    }
    if (accessStatus === 'needs-onboarding' && !isAccountSetupPending) {
      showOnboarding();
      setStep('enter-profile');
    }
    if (accessStatus === 'needs-membership') {
      void ensureAccess();
    }
  }, [
    accessStatus,
    composeEditRefused,
    isAccountSetupPending,
    ensureAccess,
    setPostOnboardingRedirect,
    setStep,
    showOnboarding,
  ]);

  const { startDate, endDate } = useRankingBlockDates({ startDate: rankingStartDate, endDate: rankingEndDate });
  const { periodState, periodLabel, submissionsOpen } = useRankingPeriod(startDate, endDate);

  const {
    submissions,
    mySubmission,
    myLastSubmission,
    myGrades,
    saveMySubmission,
    isSaving,
    personalSpaceId,
    isLoading: isLoadingMySubmission,
    ballotReadError,
    retryBallotRead,
    unsavedDraft,
  } = useRankingSubmissions(entityId, spaceId, displayName);

  // GEO-3679: the Best debates block lists what the member pushed down, and ranking one of those
  // clears its downvote once the ballot publishes.
  const {
    debates: pushedDownDebates,
    isError: isPushedDownError,
    retry: retryPushedDown,
  } = useMyPushedDownDebates({ blockId: bestDebatesBlockId });
  const { publish: publishBallotClearingDownvotes, isPublishing: isPublishingRanking } =
    useBestDebatesBallotPublisher();

  const canCreateNew = Boolean(createNewSpaceId) && !isLoadingCreateAccess && canEditCreateSpace;

  const {
    isLoadingRelations,
    globalRankingEntityIds,
    globalLeaderboard,
    aggregatedSubmitterRefs,
    aggregatedSubmitterSpaceIds,
    aggregatedRankingCount,
  } = useRankingBlockRelations();

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

  // Seeded from the author's last ballot, which survives roll-off, rather than from
  // `mySubmission`, which is blanked by it. See `myLastSubmission` (GEO-2871).
  // Precedence (GEO-3680): a handed-back draft (another device's edit overtook
  // ours) over the published ballot, with the ranker's own unpublished edits
  // merged onto whichever it is. See `useRankingComposeDraft`.
  const composeSeed = rankingComposeSeed(unsavedDraft, myLastSubmission?.orderedEntityIds, myGrades);
  // Best debates' placements and drags also merge through it, and each of its publishes moves the
  // merge base (`markDraftPublished`), so a refetch landing mid-placement keeps the placement.
  const {
    orderedIds,
    grades: draftGrades,
    setOrderedIds,
    setDraft,
    getBasedOnOrderedIds,
    getBasedOnGrades,
    markPublished: markDraftPublished,
  } = useRankingComposeDraft(composeSeed);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [activeSwipeRowKey, setActiveSwipeRowKey] = React.useState<string | null>(null);
  const [entitySheetTarget, setEntitySheetTarget] = React.useState<{
    entityId: string;
    spaceId: string;
    previewImageUrl?: string | null;
    previewName?: string | null;
    previewDescription?: string | null;
  } | null>(null);
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

  const displayMyEntityIds = orderedIds;

  const { entries: myEntries } = useRankingEntryEntities(spaceId, displayMyEntityIds);
  const myEntriesById = React.useMemo(() => new Map(myEntries.map(e => [e.entityId, e])), [myEntries]);

  const rankableEntriesByIdRaw = React.useMemo(
    () => new Map(rankableEntries.map(e => [e.entityId, e])),
    [rankableEntries]
  );

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
  // A regrade alone is a change too (GEO-3729); grades exist on Best debates only.
  const publishedGrades = mySubmission ? myGrades : NO_GRADES;
  const hasUnpublishedChanges =
    draftIdsKey !== publishedIdsKey || !sameGrades(orderedIds, draftGrades, publishedGrades);

  const isPublishBusy = isSaving || isPublishingRanking;
  // Best debates saves every placement at once (Preston, 12 Nov): how many are waiting.
  const unpublishedCount = hasUnpublishedChanges
    ? countBallotChanges(mySubmission?.orderedEntityIds ?? [], orderedIds, {
        published: publishedGrades,
        draft: draftGrades,
      })
    : 0;

  /** The ranker may write their ballot now (Publish, and "Grade your ranking"'s Save grades). */
  const canWriteBallot =
    !ballotReadError &&
    submissionsOpen &&
    (Boolean(personalSpaceId) || isAccountSetupPending) &&
    !isPublishBusy &&
    !composeEditRefused;
  const canPublish =
    canWriteBallot &&
    // Best debates can publish an emptied ranking: it clears the ranker's votes (Preston, 12 Nov).
    (orderedIds.length > 0 || isBestDebates) &&
    hasUnpublishedChanges;

  // Leaving with unpublished changes asks first (Preston, 12 Nov). The draft lives in this screen
  // only, so leaving without publishing loses it; the prompt says so.
  const leaveGuard = useUnpublishedLeaveGuard({
    active: isBestDebates && unpublishedCount > 0,
    count: unpublishedCount,
    isPublishing: isPublishBusy,
    onPublish: async () => Boolean(await handlePublish()),
  });
  handleBackRef.current = () => leaveGuard.guard(handleBackNow);

  const rankingOpportunity = useRankingOpportunity(
    entityId,
    !submissionsOpen || !hasUnpublishedChanges || (orderedIds.length === 0 && !isBestDebates) || isPublishBusy
      ? 'ineligible'
      : !personalSpaceId
        ? 'authentication_required'
        : canPublish
          ? 'eligible'
          : 'ineligible',
    !submissionsOpen
      ? 'closed'
      : orderedIds.length === 0 && !isBestDebates
        ? 'empty'
        : !hasUnpublishedChanges
          ? 'unchanged'
          : isPublishBusy
            ? 'saving'
            : !personalSpaceId
              ? 'sign_in'
              : canPublish
                ? 'ready'
                : 'unavailable'
  );

  // OG images render from indexed data, so they are built once indexing
  // settles, from the ballot the index read back, with a version key computed
  // from that same ballot. Detached: navigation never waits on it. No image when
  // the index didn't read back our ballot (another device's edit overtook it).
  const generateOgImagesOnceIndexed = (published: RankingSubmissionPublishResult) => {
    void published.indexingSettled.then(final => {
      if (!final) return;
      const ogVersion = buildRankingOgVersion({
        rankEntityId: published.rankEntityId,
        orderedEntityIds: final.orderedEntityIds,
        rankingName: displayName,
        rankingStartDate,
        rankingEndDate,
        authorName: published.authorName,
        authorAvatarUrl: published.authorAvatarUrl,
      });
      return generatePersonalRankingOgImages({
        rankEntityId: published.rankEntityId,
        authorSpaceId: published.authorSpaceId,
        blockEntityId: entityId,
        blockEntitySpaceId: spaceId,
        rankingStartDate,
        rankingEndDate,
        ogVersion,
      });
    });
  };

  const nameOf = (id: string): string | null => {
    const entry = myRankingEntriesById.get(id) ?? displayRankableEntriesById.get(id);
    if (entry && !isPlaceholderRankingEntry(entry)) return entry.name;
    const row = rowsByEntityId.get(id);
    if (row) return getRowDisplayName(row);
    return searchResultsById.get(id)?.name?.trim() || null;
  };

  /**
   * One Best debates ballot write (GEO-3678 + GEO-3679), for `useBestDebatesCompose`'s publish (which
   * files every item under its debate's own space first): the fresh closed-ranking check, then the
   * order that never leaves a debate neither ranked nor pushed down (`useBestDebatesBallotPublisher`:
   * read the ballot's downvotes, publish, clear them), built on the ballot the draft is based on.
   */
  const saveBestDebatesBallot = async (slots: RankingSubmissionSlot[]) => {
    if (composeEditRefused) return null;
    if (!rankingSubmissionsOpen(getRankingPeriodState(startDate, endDate))) {
      setToast(<span>This ranking has closed.</span>);
      return null;
    }
    const result = await publishBallotClearingDownvotes(
      slots.map(slot => slot.id),
      () =>
        saveMySubmission(slots, rankingOpportunity.context, {
          basedOnOrderedIds: getBasedOnOrderedIds(),
          basedOnGrades: getBasedOnGrades(),
        })
    );
    return result?.published ?? null;
  };

  const pushedDownEntityIds = React.useMemo(
    () => pushedDownDebates.map(debate => debate.entityId),
    [pushedDownDebates]
  );
  const pushDown = useBestDebatesPushDownSlot({ blockId: bestDebatesBlockId, pushedDownEntityIds });
  const recordGrade = useRecordGrade(entityId);
  /** The draft as it was before a Down rank from the popup, so the row's Undo can put the debate back. */
  const draftBeforeDownRank = React.useRef(new Map<string, { ids: string[]; grades: typeof draftGrades }>());
  /** How each draft grade was made (GEO-3729), so its published event says so. */
  const draftGradeMethods = React.useRef(new Map<string, GradeChange['method']>());

  const bestDebates = useBestDebatesCompose({
    enabled: isBestDebates,
    blockId: entityId,
    blockSpaceId: spaceId,
    isMobile,
    orderedIds,
    grades: draftGrades,
    setOrderedIds: (ids, movedId) => {
      setActiveSwipeRowKey(null);
      setOrderedIds(ids, movedId);
    },
    hasUnpublishedChanges,
    nameOf,
    personalSpaceId,
    saveMySubmission: saveBestDebatesBallot,
    isSaving: isPublishBusy,
    pushDown: pushDown.slot,
    onPublished: (published, sentIds, sentGrades) => {
      // The grades this ranker sent, against the ballot they were based on: never another device's
      // changes the publish merged in. Each keeps the way it was made (popup, drag).
      const before = { ids: getBasedOnOrderedIds(), grades: getBasedOnGrades() };
      for (const change of gradeChanges(before.ids, before.grades, sentIds, sentGrades)) {
        const key = ID.uuidToHex(change.entityId);
        recordGrade(change.entityId, {
          grade: change.grade,
          previousGrade: change.previousGrade,
          method: draftGradeMethods.current.get(key) ?? 'ranking_screen',
          mutationKind: 'published',
        });
        draftGradeMethods.current.delete(key);
      }
      markDraftPublished(published.orderedEntityIds, sentIds, published.grades, sentGrades);
      generateOgImagesOnceIndexed(published);
    },
    openOnToRank: searchParams?.get(BEST_DEBATES_TEAM_VIEW_PARAM) === BEST_DEBATES_TEAM_VIEW_TO_RANK,
    searchQuery,
    // Re-order's move stays in the draft however it ends; a grade it changed is counted (GEO-3729).
    onReorderEnd: ({ entityId: movedId, before, after }) => {
      for (const change of reorderGradeChanges(movedId, before, after)) {
        recordGrade(change.entityId, {
          grade: change.grade,
          previousGrade: change.previousGrade,
          method: 'reorder',
          mutationKind: 'draft',
        });
        draftGradeMethods.current.set(ID.uuidToHex(change.entityId), 'reorder');
      }
    },
  });

  // Every debate the screen can show (team column, To rank, yours, pushed down), resolved once for
  // the Best debates rows: poster, claim, debaters, space and age (GEO-3591 mockups).
  const bestDebateDisplays = useBestDebateDisplays(
    isBestDebates
      ? [
          ...orderedIds,
          ...visibleFilteredRankedIds,
          ...visibleFilteredUnrankedIds,
          ...bestDebates.toRankIds,
          ...pushedDownEntityIds,
        ]
      : [],
    isBestDebates
  );

  const buildSlots = (ids: readonly string[]) =>
    ids.map(id => {
      const row = rowsByEntityId.get(id);
      const entry = displayRankableEntriesById.get(id) ?? myEntriesById.get(id);
      const searchPreview = getSearchResultPreview(searchResultsById.get(id));
      return {
        id,
        name: entry?.name ?? (row ? getRowDisplayName(row) : searchPreview.name),
        spaceId: row?.columns[SystemIds.NAME_PROPERTY]?.space ?? searchPreview.spaceId ?? spaceId,
      };
    });

  /** The OG version for the view URL; the images themselves follow once indexing settles. */
  const regenerateOgImages = (published: RankingSubmissionPublishResult) => {
    generateOgImagesOnceIndexed(published);
    return buildRankingOgVersion({
      rankEntityId: published.rankEntityId,
      orderedEntityIds: published.orderedEntityIds,
      rankingName: displayName,
      rankingStartDate,
      rankingEndDate,
      authorName: published.authorName,
      authorAvatarUrl: published.authorAvatarUrl,
    });
  };

  /** The draft as the ranking screen's ballot, for push-down to edit (`usePushDown`). */
  const composeBallot = useComposeBallot(
    bestDebatesBlockId
      ? {
          orderedIds,
          grades: draftGrades,
          setOrderedIds,
          setDraft,
          publish: ids => bestDebates.publish(ids),
          deferPublish: true,
        }
      : null
  );

  // "Grade your ranking" (GEO-3729): once, on a ranking with no grades, the ranker drags an "A ends
  // here" and a "B ends here" line onto their order; Save publishes the same order with the grades.
  // Opened by itself when the published ranking has no grades and at least TIER_LINES_AUTO_OPEN_MIN
  // debates (unless they said Not now), from the popup's Grade it, or by `?grade=tiers` from the
  // block. A first ranking being drafted, or a published one of a debate or two, isn't opened by
  // itself: placements into an ungraded ranking carry no grade, and the lines would take over the
  // list with starting lines that grade everything C.
  const rankingNeedsGrades = isBestDebates && orderedIds.length > 0 && !hasAnyGrade(orderedIds, draftGrades);
  const publishedIds = mySubmission?.orderedEntityIds ?? [];
  const publishedNeedsGrades = publishedIds.length >= TIER_LINES_AUTO_OPEN_MIN && !hasAnyGrade(publishedIds, myGrades);
  const [tierLinesDismissed, setTierLinesDismissed] = React.useState(false);
  const [tierLines, setTierLines] = React.useState<{ aCount: number; bCount: number } | null>(null);
  const showTierLines = rankingNeedsGrades && (tierLines !== null || (publishedNeedsGrades && !tierLinesDismissed));
  const tierLineCounts = tierLines ?? defaultTierLines(orderedIds.length);
  const openTierLines = () => {
    setTierLines(current => current ?? defaultTierLines(orderedIds.length));
    if (isMobile) bestDebates.mobileTabs.onChange('my');
  };
  // From the block's popup (`?grade=tiers`): open it once, as Grade it does here, so Not now still
  // closes it.
  const openTierLinesFromUrl = searchParams?.get(BEST_DEBATES_GRADE_PARAM) === BEST_DEBATES_GRADE_TIERS;
  const openedTierLinesFromUrl = React.useRef(false);
  React.useEffect(() => {
    if (!openTierLinesFromUrl || !rankingNeedsGrades || openedTierLinesFromUrl.current) return;
    openedTierLinesFromUrl.current = true;
    openTierLines();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the ranking it needs has loaded
  }, [openTierLinesFromUrl, rankingNeedsGrades]);
  const saveTierLines = async () => {
    const grades = applyTierLines(orderedIds, tierLineCounts.aCount, tierLineCounts.bCount);
    setDraft(orderedIds, grades);
    // Each of these grades says it came from the tier lines when it publishes, now or later.
    for (const id of orderedIds) draftGradeMethods.current.set(ID.uuidToHex(id), 'tier_lines');
    if (await bestDebates.publish(orderedIds, grades)) setTierLines(null);
  };
  const tierLinesBanner = (
    <div className="mt-3 mb-1 flex items-center justify-between gap-4 rounded-lg border border-grey-02 p-3">
      <b className="text-button font-semibold">{GRADE_YOUR_RANKING_TITLE}</b>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          className="h-8 rounded-full px-3.5 text-metadata font-medium text-grey-04 hover:text-text md:h-11"
          onClick={() => {
            setTierLines(null);
            setTierLinesDismissed(true);
          }}
          data-geo-analytics-label="tier_lines_not_now"
        >
          {TIER_LINES_NOT_NOW_LABEL}
        </button>
        <button
          type="button"
          className="h-8 rounded-full bg-text px-3.5 text-metadata font-medium text-white hover:bg-text/90 disabled:opacity-50 md:h-11"
          onClick={() => void saveTierLines()}
          disabled={!canWriteBallot}
          data-geo-analytics-label="tier_lines_save"
        >
          {TIER_LINES_SAVE_LABEL}
        </button>
      </div>
    </div>
  );

  // The watch popup's grade row on this screen (GEO-3729): a grade goes into the draft, like every
  // other change here, and the screen's Publish sends it.
  const draftPlaces = new Map(orderedIds.map((id, index) => [ID.uuidToHex(id), index + 1]));
  // The draft as of the last change here, so presses quicker than a render build on each other.
  const latestDraft = React.useRef({ ids: orderedIds, grades: draftGrades });
  latestDraft.current = { ids: orderedIds, grades: draftGrades };
  const changeDraft = (
    debateId: string,
    change: (draft: { ids: string[]; grades: typeof draftGrades }) => { ids: string[]; grades: typeof draftGrades },
    method: GradeChange['method']
  ) => {
    setActiveSwipeRowKey(null);
    const before = latestDraft.current;
    const next = change(before);
    latestDraft.current = next;
    // Recorded only when the grade changes (a plain move records nothing, like the placed
    // dialog's arrows); it is recorded again, as published, when Publish lands.
    for (const gradeChange of gradeChanges(before.ids, before.grades, next.ids, next.grades)) {
      recordGrade(gradeChange.entityId, {
        grade: gradeChange.grade,
        previousGrade: gradeChange.previousGrade,
        method,
        mutationKind: 'draft',
      });
      draftGradeMethods.current.set(ID.uuidToHex(gradeChange.entityId), method);
    }
    setDraft(next.ids, next.grades);
  };
  const composeGrading: BestDebatesGrading | null = isBestDebates
    ? {
        ready: !isLoadingMySubmission && !ballotReadError,
        needsTierLines: rankingNeedsGrades,
        onGradeYourRanking: openTierLines,
        gradeOf: debateId => (draftPlaces.has(ID.uuidToHex(debateId)) ? gradeOf(draftGrades, debateId) : null),
        placeOf: debateId => draftPlaces.get(ID.uuidToHex(debateId)) ?? null,
        isSaving: () => false,
        grade: (debateId, grade, method = 'popup') =>
          changeDraft(debateId, draft => gradeInto(draft.ids, draft.grades, debateId, grade), method),
        // Its Done keeps the move in the draft, like any placement on this screen.
        reorder: debateId => bestDebates.reorder(debateId),
        remove: debateId => changeDraft(debateId, draft => removeEntry(draft.ids, draft.grades, debateId), 'popup'),
        // Counted as Down rank's own `push_down` once its downvote lands.
        downRank: debateId => {
          draftBeforeDownRank.current.set(ID.uuidToHex(debateId), { ids: orderedIds, grades: draftGrades });
          bestDebates.requestPushDown(debateId);
        },
        undoDownRank: debateId => {
          const key = ID.uuidToHex(debateId);
          const before = draftBeforeDownRank.current.get(key);
          draftBeforeDownRank.current.delete(key);
          if (!before) return;
          const restored = restoreEntry({ ids: orderedIds, grades: draftGrades }, before, debateId);
          if (restored.ids !== orderedIds) setDraft(restored.ids, restored.grades);
        },
      }
    : null;

  // "Your ranking" in tiers (GEO-3729): A, B and C with their counts, and Ungraded below when any
  // debate is. A ranking with no grades at all is the plain list, as before.
  const tierGroups =
    isBestDebates && hasAnyGrade(orderedIds, draftGrades)
      ? tierSections(orderedIds, draftGrades).map(section => ({
          key: section.tier,
          header: <BestDebatesTierHeader tier={section.tier} count={section.ids.length} />,
          entityIds: section.ids,
        }))
      : undefined;
  /** A drag in the tiered list: the new order, and a debate dragged into another tier takes its grade. */
  const regroupTiers = (groups: Array<{ key: string; entityIds: string[] }>) => {
    setActiveSwipeRowKey(null);
    const ids = groups.flatMap(group => group.entityIds);
    const nextGrades = new Map<string, Grade>();
    for (const group of groups) {
      if (group.key === 'ungraded') continue;
      for (const id of group.entityIds) nextGrades.set(ID.uuidToHex(id), group.key as Grade);
    }
    for (const change of gradeChanges(orderedIds, draftGrades, ids, nextGrades)) {
      recordGrade(change.entityId, {
        grade: change.grade,
        previousGrade: change.previousGrade,
        method: 'drag',
        mutationKind: 'draft',
      });
      draftGradeMethods.current.set(ID.uuidToHex(change.entityId), 'drag');
    }
    setDraft(ids, nextGrades);
  };

  const handlePublish = async (): Promise<boolean | undefined> => {
    if (composeEditRefused) return false;
    // `submissionsOpen` comes from the last render. Re-check against a fresh clock:
    if (!rankingSubmissionsOpen(getRankingPeriodState(startDate, endDate))) {
      setToast(<span>This ranking has closed.</span>);
      return false;
    }

    // Best debates stays on the ranking screen after a publish: rankers place debate after debate.
    if (isBestDebates) {
      return bestDebates.publish(orderedIds, draftGrades);
    }

    const slots = buildSlots(orderedIds);

    if (!personalSpaceId) {
      enqueuePendingAction({
        id: `ranking-submit:${entityId}`,
        label: 'your ranking',
        requires: 'personalSpace',
        run: () =>
          saveMySubmission(slots, rankingOpportunity.context).then(published => {
            if (!published) return;
            generateOgImagesOnceIndexed(published);
          }),
      });
      setToast(<span>Your ranking will publish once your personal space is ready.</span>);
      return;
    }

    const published = await saveMySubmission(slots, rankingOpportunity.context, {
      basedOnOrderedIds: getBasedOnOrderedIds(),
    });
    if (!published) return;
    // OG images render from indexed data, so generation waits for
    // `indexingSettled` — detached, since the redirect below must not.
    const ogVersion = regenerateOgImages(published);

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

  // The ballot exists but couldn't be read whole (GEO-3680): the list below
  // would start empty, and publishing it would replace the real one.
  const ballotReadAlert = ballotReadError ? (
    <div className="mt-2">
      <RankingBallotReadError message={ballotReadError} onRetry={retryBallotRead} />
    </div>
  ) : null;

  const titleMetadata = (
    <RankingComposeTitleMetadata
      isMobile={isMobile}
      displayName={displayName}
      showMetadata={!isMobile}
      periodState={periodState}
      periodLabel={periodLabel}
      hasRankedByOthers={hasRankedByOthers}
      submissions={submissions}
      aggregatedSubmitterRefs={aggregatedSubmitterRefs}
      aggregatedSubmitterSpaceIds={aggregatedSubmitterSpaceIds}
      aggregatedRankingCount={aggregatedRankingCount}
    />
  );

  const rankingLayout = (
    <RankingComposeLayout
      isMobile={isMobile}
      mobilePageScrollRef={isMobile ? mobilePageScrollRef : undefined}
      mobileTabs={isBestDebates ? bestDebates.mobileTabs : undefined}
      myRanking={
        <RankingComposeMyRanking
          isMobile={isMobile}
          spaceId={spaceId}
          displayEntityIds={displayMyEntityIds}
          entriesById={myRankingEntriesById}
          searchResultsById={searchResultsById}
          rowsByEntityId={rowsByEntityId}
          canPublish={canPublish}
          isSaving={isPublishBusy}
          hidePublishButton={isEntityPreviewOpen}
          activeSwipeRowKey={activeSwipeRowKey}
          onActiveSwipeRowKeyChange={setActiveSwipeRowKey}
          onPublish={() => void handlePublish()}
          onReorder={reorderMyRanking}
          onRemove={removeFromMyRanking}
          onView={openEntitySheet}
          pendingEntityIds={pendingEntityIds}
          footer={
            bestDebatesBlockId ? (
              <RankingComposePushedDown
                blockId={bestDebatesBlockId}
                debates={pushedDownDebates}
                isError={isPushedDownError}
                onRetryLoad={() => void retryPushedDown()}
              />
            ) : null
          }
          {...(isBestDebates
            ? {
                title: 'Your ranking',
                hideSidePanel: true,
                publishLabel:
                  unpublishedCount > 0
                    ? `Publish ${unpublishedCount === 1 ? '1 change' : `${unpublishedCount} changes`}`
                    : undefined,
                hideMobileHeading: true,
                // No dragging between tabs on a phone: a tap is the way in there.
                emptyText: isMobile
                  ? 'Tap a debate in Team ranking to compare it and place it here.'
                  : 'Drag debates here from the team ranking, or click one to compare.',
                onDropEntity: bestDebates.dropEntity,
                groups: tierGroups,
                onRegroup: tierGroups ? regroupTiers : undefined,
                tierLines: showTierLines
                  ? {
                      ...tierLineCounts,
                      onChange: setTierLines,
                      banner: tierLinesBanner,
                    }
                  : undefined,
                headerAction: <ClearRankingButton orderedIds={orderedIds} setDraft={setOrderedIds} />,
                emptyAction: (
                  <CopyTeamRankingStart
                    teamOrder={globalOrderedIds}
                    isTeamOrderLoading={isLoadingRelations}
                    hasRanking={
                      isLoadingMySubmission ||
                      (myLastSubmission?.orderedEntityIds.length ?? 0) > 0 ||
                      (mySubmission?.orderedEntityIds.length ?? 0) > 0
                    }
                    draftIsEmpty={orderedIds.length === 0}
                    pushedDownIds={pushedDownEntityIds}
                    setDraft={setOrderedIds}
                  />
                ),
              }
            : {})}
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
          onAddToMyRanking={isBestDebates ? bestDebates.placeFromTeam : addToMyRanking}
          teamView={isBestDebates ? bestDebates.teamView : undefined}
          draggableRows={isBestDebates}
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

  // Best debates while the flag or membership is unknown: no generic screen to flash or publish from.
  if (isBestDebatesLoading) {
    return (
      <RankingComposeFullscreen coverNavbar={isMobile}>
        <div className="flex h-full items-center justify-center text-metadata text-grey-04" role="status">
          Loading ranking…
        </div>
      </RankingComposeFullscreen>
    );
  }

  return (
    <BestDebateDisplaysContext.Provider value={isBestDebates ? bestDebateDisplays : null}>
      <MaybeWatch on={isBestDebates} blockId={entityId} spaceId={spaceId} grading={composeGrading}>
        <RankingComposeBallotContext.Provider value={composeBallot}>
          <RankingComposeCreateEntityPanel onFinished={addToMyRanking} rankingName={displayName} />
          <RankingComposeEntitySheet target={entitySheetTarget} onClose={() => setEntitySheetTarget(null)} />
          {isBestDebates ? bestDebates.dialogs : null}
          {leaveGuard.dialog}
          {pushDown.binding(isBestDebates ? bestDebates.activeEntityId : null)}
          <div ref={rankingOpportunity.root} className="contents">
            <RankingComposeFullscreen coverNavbar={isMobile}>
              {isMobile ? (
                <>
                  <div className="shrink-0 bg-white px-4 py-2">
                    <RankingComposePinnedToolbar
                      isMobile={isMobile}
                      onBack={handleBack}
                      // Best debates on a phone publishes from a bar along the bottom, shown only
                      // while there is something to publish.
                      showPublishButton={!isBestDebates}
                      canPublish={canPublish}
                      isSaving={isPublishBusy}
                      onPublish={() => void handlePublish()}
                    />
                  </div>

                  <div
                    ref={mobilePageScrollRef}
                    data-ranking-compose-mobile-scroll=""
                    data-app-scroll-surface
                    className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4"
                  >
                    <div className="pt-2 pb-4">
                      {titleMetadata}
                      {ballotReadAlert}
                    </div>
                    <div className="relative flex min-h-0 flex-col">{rankingLayout}</div>
                  </div>
                  {isBestDebates && canPublish ? (
                    <div
                      className="shrink-0 border-t border-grey-02 bg-white px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]"
                      data-testid="best-debates-mobile-publish"
                    >
                      <div className="flex items-center gap-3">
                        <span className="min-w-0 flex-1 text-breadcrumb text-grey-04">
                          {unpublishedChangesLabel(unpublishedCount)}
                        </span>
                        <Button
                          variant="primary"
                          className={cx(RANKING_COMPOSE_PUBLISH_BUTTON_CLASS, '!h-11 shrink-0 !px-4')}
                          disabled={isPublishBusy}
                          onClick={() => void handlePublish()}
                          data-analytics-feature="ranking-submit"
                        >
                          {isPublishBusy ? 'Publishing…' : 'Publish'}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="mx-auto flex h-full min-h-0 w-full max-w-[1200px] flex-col overflow-hidden px-4">
                  <div className="shrink-0 py-2">
                    <RankingComposePinnedToolbar
                      isMobile={isMobile}
                      onBack={handleBack}
                      showPublishButton={false}
                      canPublish={canPublish}
                      isSaving={isPublishBusy}
                      onPublish={() => void handlePublish()}
                    />
                    <div className="mt-3 pb-4">
                      {titleMetadata}
                      {ballotReadAlert}
                    </div>
                  </div>

                  <div className="relative min-h-0 flex-1">{rankingLayout}</div>
                </div>
              )}
            </RankingComposeFullscreen>
          </div>
        </RankingComposeBallotContext.Provider>
      </MaybeWatch>
    </BestDebateDisplaysContext.Provider>
  );
}

/** Best debates posters open their debate to watch; no other ranking block has them. */
function MaybeWatch({
  on,
  blockId,
  spaceId,
  grading,
  children,
}: {
  on: boolean;
  blockId: string;
  spaceId: string;
  grading: BestDebatesGrading | null;
  children: React.ReactNode;
}) {
  return on ? (
    <BestDebateWatchProvider source="best_debates_ranking" blockId={blockId} spaceId={spaceId} grading={grading}>
      {children}
    </BestDebateWatchProvider>
  ) : (
    <>{children}</>
  );
}

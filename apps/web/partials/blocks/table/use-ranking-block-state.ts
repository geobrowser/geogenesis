'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { useSetAtom } from 'jotai';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { PAGE_SIZE, useDataBlock } from '~/core/blocks/data/use-data-block';
import { useFilters } from '~/core/blocks/data/use-filters';
import { loadLocalMyRankingDraft, saveLocalMyRankingDraft } from '~/core/blocks/ranking/local-ranking-my-draft';
import {
  RANKING_COMPOSE_TAB_MY,
  type RankingComposeMode,
  rankingComposeHref,
} from '~/core/blocks/ranking/ranking-compose-url';
import {
  generateGlobalRankingOgImages,
  generatePersonalRankingOgImages,
} from '~/core/blocks/ranking/ranking-og-generate-client';
import { buildGlobalRankingOgVersion, buildRankingOgVersion } from '~/core/blocks/ranking/ranking-og-version';
import { formatSharedRankingOwnerLabel } from '~/core/blocks/ranking/ranking-owner-label';
import { formatRankingPeriodLabel, getRankingPeriodState } from '~/core/blocks/ranking/ranking-period';
import { getRowDescription, getRowDisplayName } from '~/core/blocks/ranking/ranking-rankable-list';
import {
  buildAbsoluteRankingShareUrl,
  buildShortGlobalRankingSharePath,
  buildShortPersonalRankingSharePath,
  shareRankingOnX,
} from '~/core/blocks/ranking/ranking-share';
import { useRankingBlockDates } from '~/core/blocks/ranking/use-ranking-block-dates';
import { useRankingBlockRelations } from '~/core/blocks/ranking/use-ranking-block-relations';
import { type RankingEntryDisplay, useRankingEntryEntities } from '~/core/blocks/ranking/use-ranking-entry-entities';
import { useRankingScope } from '~/core/blocks/ranking/use-ranking-scope';
import { useRankingSubmissions } from '~/core/blocks/ranking/use-ranking-submissions';
import { useSharedRanking } from '~/core/blocks/ranking/use-shared-ranking';
import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { useGeoProfile } from '~/core/hooks/use-geo-profile';
import { useIsMobileLayout } from '~/core/hooks/use-is-mobile-layout';
import { useOnboarding } from '~/core/hooks/use-onboarding';
import { useRankingComposeAccess } from '~/core/hooks/use-ranking-compose-access';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useCanUserEdit } from '~/core/hooks/use-user-is-editing';
import { ID } from '~/core/id';
import { useEditorInstance } from '~/core/state/editor/editor-provider';
import { useEditorStoreLite } from '~/core/state/editor/use-editor';

import { stepAtom } from '~/partials/onboarding/dialog';

import { postOnboardingRedirectAtom } from '~/atoms/post-onboarding-redirect';
import { rankingComposeReturnHrefAtom } from '~/atoms/ranking-compose-return';

export type RankingTab = 'global' | 'my';

export type RankingBlockPresentation = 'embedded' | 'fullscreen';

export type InitialGlobalRanking = {
  rankingName: string;
  orderedEntityIds: string[];
  entries: RankingEntryDisplay[];
};

type UseRankingBlockStateParams = {
  spaceId: string;
  rankingStartDate?: string;
  rankingEndDate?: string;
  paginateEmbeddedRanking?: boolean;
  sharedRankEntityId?: string;
  sharedAuthorSpaceId?: string;
  sharedOgVersion?: string;
  /** Server-resolved full ranking, seeds first paint so rows don't flash placeholders. */
  initialGlobalRanking?: InitialGlobalRanking;
};

export function useRankingBlockState({
  spaceId,
  rankingStartDate = '',
  rankingEndDate = '',
  paginateEmbeddedRanking = false,
  sharedRankEntityId = '',
  sharedAuthorSpaceId = '',
  sharedOgVersion = '',
  initialGlobalRanking,
}: UseRankingBlockStateParams) {
  const isMobile = useIsMobileLayout();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const preferMyTab = searchParams?.get('tab') === RANKING_COMPOSE_TAB_MY;
  const { showOnboarding } = useOnboarding();
  const { promptLogin, ensureAccess, status: composeAccessStatus } = useRankingComposeAccess(spaceId);
  const setPostOnboardingRedirect = useSetAtom(postOnboardingRedirectAtom);
  const setRankingComposeReturnHref = useSetAtom(rankingComposeReturnHrefAtom);
  const setStep = useSetAtom(stepAtom);

  const { name, entityId, relationId, rows } = useDataBlock();
  const { id: parentEntityId } = useEditorInstance();
  const { blockRelations } = useEditorStoreLite();

  const canEdit = useCanUserEdit(spaceId);

  const { filterState, setFilterState } = useFilters(canEdit);
  const { source, setSource } = useRankingScope({ filterState, setFilterState });

  const { startDate, endDate } = useRankingBlockDates({
    startDate: rankingStartDate,
    endDate: rankingEndDate,
  });

  const displayName = name?.trim() || initialGlobalRanking?.rankingName?.trim() || 'Untitled ranking';

  const { submissions, hasMySubmission, mySubmission, saveMySubmission, isSaving, personalSpaceId } =
    useRankingSubmissions(entityId, spaceId, displayName);

  const { sharedSubmission, isLoadingSharedSubmission } = useSharedRanking({
    rankEntityId: sharedRankEntityId,
    authorSpaceId: sharedAuthorSpaceId,
    blockEntityId: entityId,
    blockEntitySpaceId: spaceId,
  });

  const hasSharedRankingUrl = Boolean(sharedRankEntityId && sharedAuthorSpaceId);
  const isViewingOwnSharedRanking = Boolean(
    hasSharedRankingUrl && personalSpaceId && ID.equals(sharedAuthorSpaceId, personalSpaceId)
  );
  const isSharedRankingView = hasSharedRankingUrl && !isViewingOwnSharedRanking;
  const displayedSubmission = isSharedRankingView ? sharedSubmission : (sharedSubmission ?? mySubmission);

  const { globalRankingEntityIds, aggregatedSubmitterSpaceIds, aggregatedRankingCount } = useRankingBlockRelations();

  const initialOrderedIds = initialGlobalRanking?.orderedEntityIds ?? [];
  const initialGlobalEntries = initialGlobalRanking?.entries ?? [];

  const { smartAccount } = useSmartAccount();
  const walletAddress = smartAccount?.account.address;
  const { profile } = useGeoProfile(walletAddress);
  const myAvatarUrl =
    sharedSubmission?.author.avatarUrl ??
    (profile?.avatarUrl && profile.avatarUrl !== PLACEHOLDER_SPACE_IMAGE ? profile.avatarUrl : null);
  const myAvatarSeed = sharedSubmission?.author.address ?? profile?.address ?? walletAddress ?? 'anonymous';
  const showMyRankingTab = Boolean(personalSpaceId || hasSharedRankingUrl || sharedSubmission);
  const myRankingTabLabel = isSharedRankingView
    ? sharedSubmission?.author.name?.trim()
      ? formatSharedRankingOwnerLabel(sharedSubmission.author.name)
      : 'Ranking'
    : 'My ranking';

  const [isFilterOpen, setIsFilterOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<RankingTab>('global');
  const [activeSwipeRowKey, setActiveSwipeRowKey] = React.useState<string | null>(null);
  const [isMyRankingDragging, setIsMyRankingDragging] = React.useState(false);
  const [entitySheetTarget, setEntitySheetTarget] = React.useState<{
    entityId: string;
    spaceId: string;
    previewImageUrl?: string | null;
    previewName?: string | null;
    previewDescription?: string | null;
  } | null>(null);

  const rowsByEntityId = React.useMemo(() => new Map(rows.map(r => [r.entityId, r])), [rows]);

  const periodState = React.useMemo(() => getRankingPeriodState(startDate, endDate), [startDate, endDate]);

  const periodLabel = React.useMemo(
    () => formatRankingPeriodLabel(periodState, startDate, endDate),
    [periodState, startDate, endDate]
  );

  // Fall back to the server-resolved order until block relations load client-side.
  const globalDisplayEntityIds = globalRankingEntityIds.length > 0 ? globalRankingEntityIds : initialOrderedIds;
  const globalRankingIdsKey = globalDisplayEntityIds.join('|');

  const [embeddedGlobalPageNumber, setEmbeddedGlobalPageNumber] = React.useState(0);

  React.useEffect(() => {
    setEmbeddedGlobalPageNumber(0);
  }, [entityId, globalRankingIdsKey]);

  const embeddedGlobalTotalPages = Math.max(1, Math.ceil(globalDisplayEntityIds.length / PAGE_SIZE));

  React.useEffect(() => {
    setEmbeddedGlobalPageNumber(prev => Math.min(prev, embeddedGlobalTotalPages - 1));
  }, [embeddedGlobalTotalPages]);

  const paginatedGlobalDisplayEntityIds = React.useMemo(() => {
    if (!paginateEmbeddedRanking) return globalDisplayEntityIds;
    const start = embeddedGlobalPageNumber * PAGE_SIZE;
    return globalDisplayEntityIds.slice(start, start + PAGE_SIZE);
  }, [embeddedGlobalPageNumber, globalDisplayEntityIds, paginateEmbeddedRanking]);

  const globalRankingListEntityIds = paginateEmbeddedRanking ? paginatedGlobalDisplayEntityIds : globalDisplayEntityIds;

  const hasEmbeddedGlobalPreviousPage = paginateEmbeddedRanking && embeddedGlobalPageNumber > 0;
  const hasEmbeddedGlobalNextPage = paginateEmbeddedRanking && embeddedGlobalPageNumber < embeddedGlobalTotalPages - 1;
  const showEmbeddedGlobalPagination = paginateEmbeddedRanking && globalDisplayEntityIds.length > PAGE_SIZE;

  const setEmbeddedGlobalPage = React.useCallback(
    (page: number | 'previous' | 'next') => {
      setEmbeddedGlobalPageNumber(prev => {
        if (page === 'previous') return Math.max(0, prev - 1);
        if (page === 'next') return Math.min(embeddedGlobalTotalPages - 1, prev + 1);
        return Math.max(0, Math.min(embeddedGlobalTotalPages - 1, page));
      });
    },
    [embeddedGlobalTotalPages]
  );

  const hasRankedByOthers = globalDisplayEntityIds.length > 0 || aggregatedRankingCount > 0;

  const globalRankByEntityId = React.useMemo(
    () => new Map(globalDisplayEntityIds.map((id, index) => [id, index + 1])),
    [globalDisplayEntityIds]
  );

  const mySubmissionIdsKey = (displayedSubmission?.orderedEntityIds ?? []).join('|');

  const [myOrderIds, setMyOrderIds] = React.useState<string[]>([]);
  const [hasSavedDraft, setHasSavedDraft] = React.useState(false);

  React.useEffect(() => {
    const apiIds = displayedSubmission?.orderedEntityIds ?? [];
    if (apiIds.length > 0) {
      setHasSavedDraft(false);
      setMyOrderIds(apiIds);
      return;
    }

    if (hasSharedRankingUrl) {
      setHasSavedDraft(false);
      setMyOrderIds([]);
      return;
    }

    if (isLoadingSharedSubmission) {
      setHasSavedDraft(false);
      setMyOrderIds([]);
      return;
    }

    const draft = loadLocalMyRankingDraft(spaceId, entityId);
    if (draft !== null) {
      setHasSavedDraft(true);
      setMyOrderIds(draft);
      return;
    }
    setHasSavedDraft(false);
    setMyOrderIds([]);
  }, [displayedSubmission, entityId, hasSharedRankingUrl, isLoadingSharedSubmission, mySubmissionIdsKey, spaceId]);

  const draftHydrated = true;

  const persistMyOrder = React.useCallback(
    (nextIds: string[]) => {
      if (nextIds.length === 0) {
        setMyOrderIds([]);
        saveLocalMyRankingDraft(spaceId, entityId, []);
        setHasSavedDraft(false);
        return;
      }
      setMyOrderIds(nextIds);
      saveLocalMyRankingDraft(spaceId, entityId, nextIds);
      setHasSavedDraft(true);
    },
    [entityId, spaceId]
  );

  const myDisplayEntityIds = React.useMemo(() => {
    if (myOrderIds.length > 0) return myOrderIds;
    if (hasSavedDraft) return myOrderIds;
    return displayedSubmission?.orderedEntityIds ?? [];
  }, [displayedSubmission, hasSavedDraft, myOrderIds]);

  const myRankingIdsKey = myDisplayEntityIds.join('|');

  const [embeddedMyPageNumber, setEmbeddedMyPageNumber] = React.useState(0);

  React.useEffect(() => {
    setEmbeddedMyPageNumber(0);
  }, [entityId, myRankingIdsKey]);

  const embeddedMyTotalPages = Math.max(1, Math.ceil(myDisplayEntityIds.length / PAGE_SIZE));

  React.useEffect(() => {
    setEmbeddedMyPageNumber(prev => Math.min(prev, embeddedMyTotalPages - 1));
  }, [embeddedMyTotalPages]);

  const paginatedMyDisplayEntityIds = React.useMemo(() => {
    if (!paginateEmbeddedRanking) return myDisplayEntityIds;
    const start = embeddedMyPageNumber * PAGE_SIZE;
    return myDisplayEntityIds.slice(start, start + PAGE_SIZE);
  }, [embeddedMyPageNumber, myDisplayEntityIds, paginateEmbeddedRanking]);

  const myRankingListEntityIds = paginateEmbeddedRanking ? paginatedMyDisplayEntityIds : myDisplayEntityIds;

  const hasEmbeddedMyPreviousPage = paginateEmbeddedRanking && embeddedMyPageNumber > 0;
  const hasEmbeddedMyNextPage = paginateEmbeddedRanking && embeddedMyPageNumber < embeddedMyTotalPages - 1;
  const showEmbeddedMyPagination = paginateEmbeddedRanking && myDisplayEntityIds.length > PAGE_SIZE;

  const setEmbeddedMyPage = React.useCallback(
    (page: number | 'previous' | 'next') => {
      setEmbeddedMyPageNumber(prev => {
        if (page === 'previous') return Math.max(0, prev - 1);
        if (page === 'next') return Math.min(embeddedMyTotalPages - 1, prev + 1);
        return Math.max(0, Math.min(embeddedMyTotalPages - 1, page));
      });
    },
    [embeddedMyTotalPages]
  );

  const hasOwnMyRankingData =
    hasMySubmission || (!hasSharedRankingUrl && !sharedSubmission && myDisplayEntityIds.length > 0);
  const hasMyRankingData =
    hasOwnMyRankingData || Boolean(sharedSubmission) || (hasSharedRankingUrl && isSharedRankingView);
  const hasGlobalRankingData = globalDisplayEntityIds.length > 0 || aggregatedRankingCount > 0;
  const showMyRankingSection = showMyRankingTab && hasMyRankingData;
  // Logged-out users still see "Add my ranking" — clicking it opens the sign-in
  // prompt via ensureAccess instead of hiding the entry point entirely.
  const isLoggedIn = Boolean(smartAccount);
  const showAddMyRankingInGlobalHeader = (showMyRankingTab || !isLoggedIn) && !hasOwnMyRankingData;

  React.useEffect(() => {
    if (preferMyTab || (isSharedRankingView && showMyRankingSection)) {
      setActiveTab('my');
    }
  }, [isSharedRankingView, preferMyTab, showMyRankingSection]);

  React.useEffect(() => {
    if (!showMyRankingSection && activeTab === 'my' && !preferMyTab) {
      setActiveTab('global');
    }
  }, [activeTab, preferMyTab, showMyRankingSection]);

  const { entries: globalEntries, isLoading: isLoadingGlobalEntries } = useRankingEntryEntities(
    spaceId,
    globalRankingListEntityIds
  );

  const { entries: myEntries } = useRankingEntryEntities(spaceId, myRankingListEntityIds);

  const globalEntriesById = React.useMemo(() => new Map(globalEntries.map(e => [e.entityId, e])), [globalEntries]);
  const myEntriesById = React.useMemo(() => new Map(myEntries.map(e => [e.entityId, e])), [myEntries]);

  const globalRankingEntryByEntityId = React.useMemo(() => {
    const map = new Map<string, RankingEntryDisplay>();

    // Seed from the server ranking; live `rows`/`globalEntries` below override with the same data.
    for (const entry of initialGlobalEntries) {
      map.set(entry.entityId, entry);
    }

    for (const row of rows) {
      if (!row.entityId || row.placeholder) continue;
      map.set(row.entityId, {
        entityId: row.entityId,
        name: getRowDisplayName(row),
        description: getRowDescription(row),
        image: row.columns[SystemIds.NAME_PROPERTY]?.image ?? null,
      });
    }

    for (const entry of globalEntries) {
      const fromRow = map.get(entry.entityId);
      map.set(entry.entityId, {
        entityId: entry.entityId,
        name: entry.name,
        description: entry.description ?? fromRow?.description ?? null,
        image: entry.image ?? fromRow?.image ?? null,
      });
    }

    return map;
  }, [globalEntries, initialGlobalEntries, rows]);

  const myRankingEntryByEntityId = React.useMemo(() => {
    const map = new Map<string, RankingEntryDisplay>();

    for (const row of rows) {
      if (!row.entityId || row.placeholder) continue;
      map.set(row.entityId, {
        entityId: row.entityId,
        name: getRowDisplayName(row),
        description: getRowDescription(row),
        image: row.columns[SystemIds.NAME_PROPERTY]?.image ?? null,
      });
    }

    for (const entry of myEntries) {
      const fromRow = map.get(entry.entityId);
      map.set(entry.entityId, {
        entityId: entry.entityId,
        name: entry.name,
        description: entry.description ?? fromRow?.description ?? null,
        image: entry.image ?? fromRow?.image ?? null,
      });
    }

    return map;
  }, [myEntries, rows]);

  const resolveEntitySpaceId = React.useCallback(
    (targetEntityId: string) => {
      const row = rowsByEntityId.get(targetEntityId);
      return row?.columns[SystemIds.NAME_PROPERTY]?.space ?? spaceId;
    },
    [rowsByEntityId, spaceId]
  );

  const openEntitySheet = React.useCallback(
    (targetEntityId: string) => {
      const entry = myRankingEntryByEntityId.get(targetEntityId) ?? globalRankingEntryByEntityId.get(targetEntityId);
      const row = rowsByEntityId.get(targetEntityId);
      setEntitySheetTarget({
        entityId: targetEntityId,
        spaceId: resolveEntitySpaceId(targetEntityId),
        previewImageUrl: entry?.image ?? null,
        previewName: entry?.name ?? (row ? getRowDisplayName(row) : null),
        previewDescription: entry?.description ?? (row ? getRowDescription(row) : null),
      });
    },
    [globalRankingEntryByEntityId, myRankingEntryByEntityId, resolveEntitySpaceId, rowsByEntityId]
  );

  const buildSubmissionSlots = React.useCallback(
    (orderedIds: string[]) =>
      orderedIds.map(id => {
        const entry = myEntriesById.get(id);
        const row = rowsByEntityId.get(id);
        return {
          id,
          name: entry?.name ?? (row ? getRowDisplayName(row) : null),
          spaceId: resolveEntitySpaceId(id),
        };
      }),
    [myEntriesById, resolveEntitySpaceId, rowsByEntityId]
  );

  const removeFromMyRanking = React.useCallback(
    (targetEntityId: string) => {
      setActiveSwipeRowKey(null);
      if (isSharedRankingView) return;
      const remaining = myDisplayEntityIds.filter(id => id !== targetEntityId);
      persistMyOrder(remaining);

      if (hasMySubmission) {
        void saveMySubmission(buildSubmissionSlots(remaining));
      }
    },
    [buildSubmissionSlots, hasMySubmission, isSharedRankingView, myDisplayEntityIds, persistMyOrder, saveMySubmission]
  );

  const reorderMyRanking = React.useCallback(
    (nextIds: string[]) => {
      const current = myDisplayEntityIds;
      if (isSharedRankingView) return;
      if (nextIds.length === 0 && current.length > 0) return;
      if (nextIds.length !== current.length) return;

      const currentIdSet = new Set(current);
      if (!nextIds.every(id => currentIdSet.has(id))) return;

      setActiveSwipeRowKey(null);
      persistMyOrder(nextIds);

      if (hasMySubmission) {
        void saveMySubmission(buildSubmissionSlots(nextIds));
      }
    },
    [buildSubmissionSlots, hasMySubmission, isSharedRankingView, myDisplayEntityIds, persistMyOrder, saveMySubmission]
  );

  const resolveBlockRelationId = React.useCallback(() => {
    if (relationId) return relationId;
    const blockRelation = blockRelations.find(r => r.block.id === entityId);
    return blockRelation?.relationId ?? blockRelation?.id ?? blockRelation?.entityId ?? '';
  }, [blockRelations, entityId, relationId]);

  const openRankingCompose = React.useCallback(
    async (mode: RankingComposeMode = 'edit') => {
      const effectiveRelationId = resolveBlockRelationId();
      if (!effectiveRelationId) return;

      const href = rankingComposeHref({
        spaceId,
        blockEntityId: entityId,
        relationId: effectiveRelationId,
        parentEntityId,
        rankingStartDate,
        rankingEndDate,
        mode,
      });

      if (composeAccessStatus === 'not-found') {
        return;
      }

      if (mode !== 'view') {
        const queryString = searchParams?.toString() ?? '';
        setRankingComposeReturnHref(`${pathname}${queryString ? `?${queryString}` : ''}`);

        if (!smartAccount) {
          promptLogin(href);
          return;
        }

        if (composeAccessStatus === 'needs-login' || composeAccessStatus === 'needs-onboarding') {
          setPostOnboardingRedirect(href);
        }

        if (composeAccessStatus === 'needs-onboarding') {
          showOnboarding();
          setStep('enter-profile');
          return;
        }

        // Non-members can still build and publish their ranking
        void ensureAccess();
      }

      router.push(href);
    },
    [
      composeAccessStatus,
      ensureAccess,
      promptLogin,
      showOnboarding,
      entityId,
      parentEntityId,
      pathname,
      rankingEndDate,
      rankingStartDate,
      resolveBlockRelationId,
      router,
      setPostOnboardingRedirect,
      setRankingComposeReturnHref,
      setStep,
      searchParams,
      smartAccount,
      spaceId,
    ]
  );

  const effectiveRelationId = resolveBlockRelationId();
  const shareRankEntityId = sharedRankEntityId || mySubmission?.id || '';
  const shareAuthorSpaceId = sharedAuthorSpaceId || mySubmission?.authorSpaceId || '';
  const effectiveOgVersion = React.useMemo(() => {
    if (sharedOgVersion) return sharedOgVersion;
    if (!mySubmission || !shareRankEntityId) return '';
    return buildRankingOgVersion({
      rankEntityId: shareRankEntityId,
      orderedEntityIds: mySubmission.orderedEntityIds,
      rankingName: displayName,
      rankingStartDate,
      rankingEndDate,
      authorName: mySubmission.author.name,
      authorAvatarUrl: mySubmission.author.avatarUrl,
    });
  }, [displayName, mySubmission, rankingEndDate, rankingStartDate, shareRankEntityId, sharedOgVersion]);
  const effectiveGlobalOgVersion = React.useMemo(
    () =>
      buildGlobalRankingOgVersion({
        blockEntityId: entityId,
        orderedEntityIds: globalRankingEntityIds,
        rankingName: displayName,
        rankingStartDate,
        rankingEndDate,
      }),
    [displayName, entityId, globalRankingEntityIds, rankingEndDate, rankingStartDate]
  );
  // Short, opaque deep link — the `/r/{rankEntityId}` resolver reconstructs the
  // block, dates, placement, ogVersion and tab server-side. Gating stays the same
  // so the share button's visibility is unchanged.
  const personalSharePath =
    shareRankEntityId && shareAuthorSpaceId && effectiveRelationId
      ? buildShortPersonalRankingSharePath(shareRankEntityId)
      : null;
  const canSharePersonalRanking = Boolean(personalSharePath && !isSharedRankingView && hasMySubmission);

  const ensurePersonalRankingOg = React.useCallback(async () => {
    if (isSharedRankingView || !effectiveOgVersion || !shareRankEntityId || !shareAuthorSpaceId) return;
    await generatePersonalRankingOgImages({
      rankEntityId: shareRankEntityId,
      authorSpaceId: shareAuthorSpaceId,
      blockEntityId: entityId,
      blockEntitySpaceId: spaceId,
      rankingStartDate,
      rankingEndDate,
      ogVersion: effectiveOgVersion,
    });
  }, [
    effectiveOgVersion,
    entityId,
    isSharedRankingView,
    rankingEndDate,
    rankingStartDate,
    shareAuthorSpaceId,
    shareRankEntityId,
    spaceId,
  ]);

  const sharePersonalRanking = React.useCallback(() => {
    if (!personalSharePath) return;
    const shareUrl = buildAbsoluteRankingShareUrl(personalSharePath);
    const shareText = `Here's my ${name?.trim() || 'ranking'}. What's yours?`;
    // Open X within the click's user activation — popup blockers drop window.open
    // after an await. The OG image is pre-warmed in the background (and the share
    // route falls back to a live preview render if the R2 object isn't ready yet),
    // so the card still resolves even if the user posts immediately.
    shareRankingOnX(shareUrl, shareText);
    void ensurePersonalRankingOg().catch(() => {});
  }, [name, ensurePersonalRankingOg, personalSharePath]);

  // Generate the personal OG image
  React.useEffect(() => {
    if (!canSharePersonalRanking || !effectiveOgVersion) return;
    const timer = window.setTimeout(() => {
      void ensurePersonalRankingOg();
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [canSharePersonalRanking, effectiveOgVersion, ensurePersonalRankingOg]);

  const globalSharePath = effectiveRelationId ? buildShortGlobalRankingSharePath(entityId) : null;

  const ensureGlobalRankingOg = React.useCallback(async () => {
    if (!effectiveGlobalOgVersion) return;
    await generateGlobalRankingOgImages({
      blockEntityId: entityId,
      blockEntitySpaceId: spaceId,
      rankingStartDate,
      rankingEndDate,
      globalOgVersion: effectiveGlobalOgVersion,
    });
  }, [effectiveGlobalOgVersion, entityId, rankingEndDate, rankingStartDate, spaceId]);

  const showEditRankingButton = hasMySubmission || (!isSharedRankingView && myDisplayEntityIds.length > 0);

  const showFirstRankingPrompt =
    !isLoadingGlobalEntries &&
    globalDisplayEntityIds.length === 0 &&
    aggregatedRankingCount === 0 &&
    myDisplayEntityIds.length === 0;

  return {
    spaceId,
    rankingStartDate,
    rankingEndDate,
    isMobile,
    canEdit,
    filterState,
    setFilterState,
    source,
    setSource,
    isFilterOpen,
    setIsFilterOpen,
    displayName,
    entityId,
    submissions,
    periodState,
    periodLabel,
    hasRankedByOthers,
    aggregatedSubmitterSpaceIds,
    aggregatedRankingCount,
    globalDisplayEntityIds: globalRankingListEntityIds,
    totalGlobalRankingEntityCount: globalDisplayEntityIds.length,
    globalRankByEntityId,
    showEmbeddedGlobalPagination,
    embeddedGlobalPageNumber,
    hasEmbeddedGlobalPreviousPage,
    hasEmbeddedGlobalNextPage,
    setEmbeddedGlobalPage,
    globalEntriesById,
    globalRankingEntryByEntityId,
    isLoadingGlobalEntries,
    myDisplayEntityIds: myRankingListEntityIds,
    totalMyRankingEntityCount: myDisplayEntityIds.length,
    embeddedMyPageNumber,
    showEmbeddedMyPagination,
    hasEmbeddedMyPreviousPage,
    hasEmbeddedMyNextPage,
    setEmbeddedMyPage,
    myRankingEntryByEntityId,
    myAvatarUrl,
    myAvatarSeed,
    myRankingTabLabel,
    isSharedRankingView,
    showMyRankingTab,
    showMyRankingSection,
    showAddMyRankingInGlobalHeader,
    showFirstRankingPrompt,
    showEditRankingButton,
    canSharePersonalRanking,
    sharePersonalRanking,
    globalSharePath,
    ensureGlobalRankingOg,
    personalSharePath,
    parentEntityId,
    isSaving,
    openRankingCompose,
    activeTab,
    setActiveTab,
    activeSwipeRowKey,
    setActiveSwipeRowKey,
    isMyRankingDragging,
    setIsMyRankingDragging,
    entitySheetTarget,
    setEntitySheetTarget,
    draftHydrated,
    hasMySubmission,
    removeFromMyRanking,
    reorderMyRanking,
    openEntitySheet,
    hasMyRankingData,
    hasGlobalRankingData,
  };
}

export type RankingBlockState = ReturnType<typeof useRankingBlockState>;

'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { useSetAtom } from 'jotai';
import { useRouter } from 'next/navigation';

import { useDataBlock } from '~/core/blocks/data/use-data-block';
import { useFilters } from '~/core/blocks/data/use-filters';
import { loadLocalMyRankingDraft, saveLocalMyRankingDraft } from '~/core/blocks/ranking/local-ranking-my-draft';
import { type RankingComposeMode, rankingComposeHref } from '~/core/blocks/ranking/ranking-compose-url';
import { formatRankingPeriodLabel, getRankingPeriodState } from '~/core/blocks/ranking/ranking-period';
import { getRowDescription, getRowDisplayName } from '~/core/blocks/ranking/ranking-rankable-list';
import { useRankingBlockDates } from '~/core/blocks/ranking/use-ranking-block-dates';
import { useRankingBlockRelations } from '~/core/blocks/ranking/use-ranking-block-relations';
import { type RankingEntryDisplay, useRankingEntryEntities } from '~/core/blocks/ranking/use-ranking-entry-entities';
import { useRankingScope } from '~/core/blocks/ranking/use-ranking-scope';
import { useRankingSubmissions } from '~/core/blocks/ranking/use-ranking-submissions';
import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { useGeoProfile } from '~/core/hooks/use-geo-profile';
import { useIsMobileLayout } from '~/core/hooks/use-is-mobile-layout';
import { useRankingComposeAccess } from '~/core/hooks/use-ranking-compose-access';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useCanUserEdit } from '~/core/hooks/use-user-is-editing';
import { useEditorInstance } from '~/core/state/editor/editor-provider';
import { useEditorStoreLite } from '~/core/state/editor/use-editor';

import { postOnboardingRedirectAtom } from '~/atoms/post-onboarding-redirect';

export type RankingTab = 'global' | 'my';

export type RankingBlockPresentation = 'embedded' | 'fullscreen';

type UseRankingBlockStateParams = {
  spaceId: string;
  rankingStartDate?: string;
  rankingEndDate?: string;
};

export function useRankingBlockState({
  spaceId,
  rankingStartDate = '',
  rankingEndDate = '',
}: UseRankingBlockStateParams) {
  const isMobile = useIsMobileLayout();
  const router = useRouter();
  const { ensureAccess, status: composeAccessStatus } = useRankingComposeAccess(spaceId);
  const setPostOnboardingRedirect = useSetAtom(postOnboardingRedirectAtom);

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

  const displayName = name?.trim() || 'Untitled ranking';

  const { submissions, hasMySubmission, mySubmission, saveMySubmission, isSaving, personalSpaceId } =
    useRankingSubmissions(entityId, spaceId, displayName);

  const { globalRankingEntityIds, globalLeaderboard, aggregatedSubmitterSpaceIds, aggregatedRankingCount } =
    useRankingBlockRelations();

  const { smartAccount } = useSmartAccount();
  const walletAddress = smartAccount?.account.address;
  const { profile } = useGeoProfile(walletAddress);
  const myAvatarUrl = profile?.avatarUrl && profile.avatarUrl !== PLACEHOLDER_SPACE_IMAGE ? profile.avatarUrl : null;
  const myAvatarSeed = profile?.address ?? walletAddress ?? 'anonymous';
  const showMyRankingTab = Boolean(personalSpaceId);

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

  const globalDisplayEntityIds = globalRankingEntityIds;

  const hasRankedByOthers = globalDisplayEntityIds.length > 0 || aggregatedRankingCount > 0;
  const showAggregatedRankingsOnGlobalTab = aggregatedRankingCount > 0;
  const visibleAggregatedSubmitterSpaceIds = aggregatedSubmitterSpaceIds.slice(0, 3);

  const globalRankByEntityId = React.useMemo(
    () => new Map(globalLeaderboard.map(e => [e.entityId, e.rank])),
    [globalLeaderboard]
  );

  const mySubmissionIdsKey = (mySubmission?.orderedEntityIds ?? []).join('|');

  const [myOrderIds, setMyOrderIds] = React.useState<string[]>([]);
  const [hasSavedDraft, setHasSavedDraft] = React.useState(false);

  React.useEffect(() => {
    const apiIds = mySubmission?.orderedEntityIds ?? [];
    if (apiIds.length > 0) {
      setHasSavedDraft(false);
      setMyOrderIds(apiIds);
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
  }, [entityId, mySubmissionIdsKey, mySubmission, spaceId]);

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
    return mySubmission?.orderedEntityIds ?? [];
  }, [hasSavedDraft, myOrderIds, mySubmission]);

  const hasMyRankingData = myDisplayEntityIds.length > 0 || hasMySubmission;
  const hasGlobalRankingData = globalDisplayEntityIds.length > 0 || aggregatedRankingCount > 0;
  const showMyRankingSection = showMyRankingTab && hasMyRankingData;
  const showContributePointsBanner = showMyRankingTab && !hasMyRankingData && hasGlobalRankingData;
  // Logged-out users still see "Add my ranking" — clicking it opens the sign-in
  // prompt via ensureAccess instead of hiding the entry point entirely.
  const isLoggedIn = Boolean(smartAccount);
  const showAddMyRankingInGlobalHeader = (showMyRankingTab || !isLoggedIn) && !hasMyRankingData;

  React.useEffect(() => {
    if (!showMyRankingSection && activeTab === 'my') {
      setActiveTab('global');
    }
  }, [activeTab, showMyRankingSection]);

  const { entries: globalEntries, isLoading: isLoadingGlobalEntries } = useRankingEntryEntities(
    spaceId,
    globalDisplayEntityIds
  );

  const { entries: myEntries } = useRankingEntryEntities(spaceId, myDisplayEntityIds);

  const globalEntriesById = React.useMemo(() => new Map(globalEntries.map(e => [e.entityId, e])), [globalEntries]);
  const myEntriesById = React.useMemo(() => new Map(myEntries.map(e => [e.entityId, e])), [myEntries]);

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
      const entry = myRankingEntryByEntityId.get(targetEntityId) ?? globalEntriesById.get(targetEntityId);
      const row = rowsByEntityId.get(targetEntityId);
      setEntitySheetTarget({
        entityId: targetEntityId,
        spaceId: resolveEntitySpaceId(targetEntityId),
        previewImageUrl: entry?.image ?? null,
        previewName: entry?.name ?? (row ? getRowDisplayName(row) : null),
        previewDescription: entry?.description ?? (row ? getRowDescription(row) : null),
      });
    },
    [globalEntriesById, myRankingEntryByEntityId, resolveEntitySpaceId, rowsByEntityId]
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
      const remaining = myDisplayEntityIds.filter(id => id !== targetEntityId);
      persistMyOrder(remaining);

      if (hasMySubmission) {
        void saveMySubmission(buildSubmissionSlots(remaining));
      }
    },
    [buildSubmissionSlots, hasMySubmission, myDisplayEntityIds, persistMyOrder, saveMySubmission]
  );

  const reorderMyRanking = React.useCallback(
    (nextIds: string[]) => {
      const current = myDisplayEntityIds;
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
    [buildSubmissionSlots, hasMySubmission, myDisplayEntityIds, persistMyOrder, saveMySubmission]
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

      // Browsing the fullscreen view doesn't require auth — only composing does.
      // Logged-out users get the sign-in prompt when they try to add a ranking.
      if (mode !== 'view') {
        // Record the destination before prompting for auth so the user resumes
        // this flow right after logging in or finishing onboarding, instead of
        // staying put / landing on Explore. `!smartAccount` also covers clicks
        // during a transient 'loading' status. Membership-pending blocks (DAO
        // join requests) intentionally don't auto-navigate.
        if (!smartAccount || composeAccessStatus === 'needs-login' || composeAccessStatus === 'needs-onboarding') {
          setPostOnboardingRedirect(href);
        }
        const allowed = await ensureAccess();
        if (!allowed) return;
      }

      router.push(href);
    },
    [
      composeAccessStatus,
      ensureAccess,
      entityId,
      parentEntityId,
      rankingEndDate,
      rankingStartDate,
      resolveBlockRelationId,
      router,
      setPostOnboardingRedirect,
      smartAccount,
      spaceId,
    ]
  );

  const showEditRankingButton = hasMySubmission || myDisplayEntityIds.length > 0;

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
    globalDisplayEntityIds,
    globalRankByEntityId,
    globalEntriesById,
    isLoadingGlobalEntries,
    myDisplayEntityIds,
    myRankingEntryByEntityId,
    myAvatarUrl,
    myAvatarSeed,
    showMyRankingTab,
    showMyRankingSection,
    showContributePointsBanner,
    showAddMyRankingInGlobalHeader,
    showAggregatedRankingsOnGlobalTab,
    visibleAggregatedSubmitterSpaceIds,
    showFirstRankingPrompt,
    showEditRankingButton,
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

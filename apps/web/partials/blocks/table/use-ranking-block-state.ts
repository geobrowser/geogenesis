'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { useSetAtom } from 'jotai';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { useDataBlock } from '~/core/blocks/data/use-data-block';
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
import {
  getPendingProposerSpaceIds,
  isPlaceholderRankingEntry,
} from '~/core/blocks/ranking/ranking-pending-proposal-entries';
import { formatRankingPeriodLabel, getRankingPeriodState } from '~/core/blocks/ranking/ranking-period';
import { getRowDescription, getRowDisplayName } from '~/core/blocks/ranking/ranking-rankable-list';
import { getScopeFromFilters } from '~/core/blocks/ranking/ranking-scope';
import {
  buildAbsoluteRankingShareUrl,
  buildShortGlobalRankingSharePath,
  buildShortPersonalRankingSharePath,
  shareRankingOnX,
} from '~/core/blocks/ranking/ranking-share';
import { useRankingBlockDates } from '~/core/blocks/ranking/use-ranking-block-dates';
import { useRankingBlockRelations } from '~/core/blocks/ranking/use-ranking-block-relations';
import { type RankingEntryDisplay, useRankingEntryEntities } from '~/core/blocks/ranking/use-ranking-entry-entities';
import { useRankingPendingEntities } from '~/core/blocks/ranking/use-ranking-pending-proposals';
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

/**
 * Server-resolved shared submission (a personal `/r/{rankEntityId}` link). Seeds
 * the my/shared ranking list so the page paints every row with real names on
 * first paint instead of cascading loading -> empty -> "Untitled" -> resolved.
 */
export type InitialSharedRanking = {
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
  /** Server-resolved shared submission, seeds the my/shared ranking on first paint. */
  initialSharedRanking?: InitialSharedRanking;
};

// Stable empty fallbacks so absent SSR seeds don't produce a fresh `[]` each
// render, which would defeat the `useMemo`s that depend on these values.
const EMPTY_ENTITY_IDS: string[] = [];
const EMPTY_ENTITY_ID_SET: ReadonlySet<string> = new Set<string>();
const EMPTY_RANKING_ENTRIES: RankingEntryDisplay[] = [];

export function useRankingBlockState({
  spaceId,
  rankingStartDate = '',
  rankingEndDate = '',
  paginateEmbeddedRanking = false,
  sharedRankEntityId = '',
  sharedAuthorSpaceId = '',
  sharedOgVersion = '',
  initialGlobalRanking,
  initialSharedRanking,
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

  const { name, entityId, relationId, rows, pageSize } = useDataBlock();
  const { id: parentEntityId } = useEditorInstance();
  const { blockRelations } = useEditorStoreLite();

  const canEdit = useCanUserEdit(spaceId);

  const { filterState, resolvedFilterState, filterMode, setFilterState, setFilterMode } = useFilters(canEdit);
  const { source, setSource } = useRankingScope({ filterState, setFilterState });

  const { startDate, endDate } = useRankingBlockDates({
    startDate: rankingStartDate,
    endDate: rankingEndDate,
  });

  const displayName =
    name?.trim() ||
    initialGlobalRanking?.rankingName?.trim() ||
    initialSharedRanking?.rankingName?.trim() ||
    'Untitled ranking';

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
  // When viewing our own ranking (including right after publishing) trust the live
  // `mySubmission` query, which `saveMySubmission` refetches once the indexer reflects
  // the new order. `sharedSubmission` has a 60s staleTime and isn't invalidated on
  // publish, so preferring it here showed the pre-edit order until a hard refresh.
  const displayedSubmission = isSharedRankingView ? sharedSubmission : (mySubmission ?? sharedSubmission);

  const { globalRankingEntityIds, aggregatedSubmitterSpaceIds, aggregatedRankingCount } = useRankingBlockRelations();

  const initialOrderedIds = initialGlobalRanking?.orderedEntityIds ?? EMPTY_ENTITY_IDS;
  const initialGlobalEntries = initialGlobalRanking?.entries ?? EMPTY_RANKING_ENTRIES;
  const initialSharedOrderedIds = initialSharedRanking?.orderedEntityIds ?? EMPTY_ENTITY_IDS;
  const initialSharedEntries = initialSharedRanking?.entries ?? EMPTY_RANKING_ENTRIES;

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

  // Embedded global pagination is derived from the *visible* list (pending/placeholder
  // rows removed) further below — not here — so pages aren't sliced from the raw list
  // and then shortened, which produced empty/short pages and inflated page counts.
  // Only the page-number state lives here; the derived values follow the visible list.
  const [embeddedGlobalPageNumber, setEmbeddedGlobalPageNumber] = React.useState(0);

  const hasRankedByOthers = globalDisplayEntityIds.length > 0 || aggregatedRankingCount > 0;

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
    // Fall back to the server-resolved shared order until the live submission
    // loads client-side, so the shared view doesn't flash an empty ranking.
    return displayedSubmission?.orderedEntityIds ?? initialSharedOrderedIds;
  }, [displayedSubmission, hasSavedDraft, myOrderIds, initialSharedOrderedIds]);

  const myRankingIdsKey = myDisplayEntityIds.join('|');

  const [embeddedMyPageNumber, setEmbeddedMyPageNumber] = React.useState(0);

  React.useEffect(() => {
    setEmbeddedMyPageNumber(0);
  }, [entityId, myRankingIdsKey]);

  const embeddedMyTotalPages = Math.max(1, Math.ceil(myDisplayEntityIds.length / pageSize));

  React.useEffect(() => {
    setEmbeddedMyPageNumber(prev => Math.min(prev, embeddedMyTotalPages - 1));
  }, [embeddedMyTotalPages]);

  const paginatedMyDisplayEntityIds = React.useMemo(() => {
    if (!paginateEmbeddedRanking) return myDisplayEntityIds;
    const start = embeddedMyPageNumber * pageSize;
    return myDisplayEntityIds.slice(start, start + pageSize);
  }, [embeddedMyPageNumber, myDisplayEntityIds, paginateEmbeddedRanking, pageSize]);

  const myRankingListEntityIds = paginateEmbeddedRanking ? paginatedMyDisplayEntityIds : myDisplayEntityIds;

  const hasEmbeddedMyPreviousPage = paginateEmbeddedRanking && embeddedMyPageNumber > 0;
  const hasEmbeddedMyNextPage = paginateEmbeddedRanking && embeddedMyPageNumber < embeddedMyTotalPages - 1;
  const showEmbeddedMyPagination = paginateEmbeddedRanking && myDisplayEntityIds.length > pageSize;

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

  // Resolve the FULL global list (not just the current page) so placeholder/pending
  // rows can be identified and removed *before* pagination. For the non-paginated
  // compose view this list already equals the rendered list, so it's no extra work
  // there; for embedded blocks it's one bounded, cached batch query.
  const { entries: globalEntries, isLoading: isLoadingGlobalEntries } = useRankingEntryEntities(
    spaceId,
    globalDisplayEntityIds
  );

  const { entries: myEntries, isLoading: isLoadingMyEntries } = useRankingEntryEntities(
    spaceId,
    myRankingListEntityIds
  );

  const globalEntriesById = React.useMemo(() => new Map(globalEntries.map(e => [e.entityId, e])), [globalEntries]);
  const myEntriesById = React.useMemo(() => new Map(myEntries.map(e => [e.entityId, e])), [myEntries]);

  const globalRankingEntryByEntityIdBase = React.useMemo(() => {
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

  const myRankingEntryByEntityIdBase = React.useMemo(() => {
    const map = new Map<string, RankingEntryDisplay>();

    // Seed from the server-resolved shared ranking; live `rows`/`myEntries`
    // below override with the same data once they hydrate.
    for (const entry of initialSharedEntries) {
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
  }, [myEntries, rows, initialSharedEntries]);

  // Hide unresolved rows from the global leaderboard for everyone. A row is
  // "unresolved" when the indexer returns no real name for it (placeholder) — this
  // covers governance-pending entities (backfilled below for my-ranking + the opt-in
  // disclosure) as well as deleted/rejected ones, so the public list never shows
  // nameless ghost rows. Empty while entries are still loading, so nothing flickers
  // out before names resolve.
  const placeholderGlobalEntityIds = React.useMemo(() => {
    if (isLoadingGlobalEntries) return EMPTY_ENTITY_ID_SET;
    const ids = new Set<string>();
    for (const id of globalDisplayEntityIds) {
      if (id && isPlaceholderRankingEntry(globalRankingEntryByEntityIdBase.get(id))) ids.add(id);
    }
    return ids;
  }, [isLoadingGlobalEntries, globalDisplayEntityIds, globalRankingEntryByEntityIdBase]);

  // The global list everyone sees: raw order minus hidden rows, renumbered contiguously.
  const visibleGlobalDisplayEntityIds = React.useMemo(
    () =>
      placeholderGlobalEntityIds.size === 0
        ? globalDisplayEntityIds
        : globalDisplayEntityIds.filter(id => !placeholderGlobalEntityIds.has(id)),
    [globalDisplayEntityIds, placeholderGlobalEntityIds]
  );

  // Pagination derives from the visible list, so page counts and slices stay correct.
  const visibleGlobalIdsKey = visibleGlobalDisplayEntityIds.join('|');

  React.useEffect(() => {
    setEmbeddedGlobalPageNumber(0);
  }, [entityId, visibleGlobalIdsKey]);

  const embeddedGlobalTotalPages = Math.max(1, Math.ceil(visibleGlobalDisplayEntityIds.length / pageSize));

  React.useEffect(() => {
    setEmbeddedGlobalPageNumber(prev => Math.min(prev, embeddedGlobalTotalPages - 1));
  }, [embeddedGlobalTotalPages]);

  const paginatedGlobalDisplayEntityIds = React.useMemo(() => {
    if (!paginateEmbeddedRanking) return visibleGlobalDisplayEntityIds;
    const start = embeddedGlobalPageNumber * pageSize;
    return visibleGlobalDisplayEntityIds.slice(start, start + pageSize);
  }, [embeddedGlobalPageNumber, paginateEmbeddedRanking, pageSize, visibleGlobalDisplayEntityIds]);

  const globalRankingListEntityIds = paginateEmbeddedRanking
    ? paginatedGlobalDisplayEntityIds
    : visibleGlobalDisplayEntityIds;

  const hasEmbeddedGlobalPreviousPage = paginateEmbeddedRanking && embeddedGlobalPageNumber > 0;
  const hasEmbeddedGlobalNextPage = paginateEmbeddedRanking && embeddedGlobalPageNumber < embeddedGlobalTotalPages - 1;
  const showEmbeddedGlobalPagination = paginateEmbeddedRanking && visibleGlobalDisplayEntityIds.length > pageSize;

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

  const pendingTargetSpaceId = React.useMemo(() => {
    const scope = getScopeFromFilters(filterState);
    if (scope.type !== 'SPACES') return null;
    const spaceIds = [...new Set(scope.value.filter(Boolean))];
    return spaceIds.length === 1 ? spaceIds[0]! : null;
  }, [filterState]);

  const entriesSettled = !isLoadingGlobalEntries && !isLoadingMyEntries;

  const unresolvedRankingEntityIds = React.useMemo(() => {
    if (!entriesSettled) return EMPTY_ENTITY_IDS;
    // Global placeholders are already computed (and hidden from the leaderboard);
    // reuse them so their names get backfilled for the opt-in disclosure.
    const ids = new Set<string>(placeholderGlobalEntityIds);
    for (const id of myRankingListEntityIds) {
      if (id && isPlaceholderRankingEntry(myRankingEntryByEntityIdBase.get(id))) ids.add(id);
    }
    return ids.size > 0 ? [...ids] : EMPTY_ENTITY_IDS;
  }, [entriesSettled, placeholderGlobalEntityIds, myRankingListEntityIds, myRankingEntryByEntityIdBase]);

  const ownRankingEntityIds = React.useMemo(
    () => (isSharedRankingView || !personalSpaceId ? EMPTY_ENTITY_IDS : myRankingListEntityIds),
    [isSharedRankingView, personalSpaceId, myRankingListEntityIds]
  );

  const pendingCandidateEntityIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const id of ownRankingEntityIds) if (id) ids.add(id);
    for (const id of unresolvedRankingEntityIds) if (id) ids.add(id);
    return ids.size > 0 ? [...ids] : EMPTY_ENTITY_IDS;
  }, [ownRankingEntityIds, unresolvedRankingEntityIds]);

  const pendingProposerSpaceIds = React.useMemo(() => {
    const submitters = unresolvedRankingEntityIds.length > 0 ? aggregatedSubmitterSpaceIds : [];
    const extra = [personalSpaceId, sharedAuthorSpaceId].filter(Boolean) as string[];
    return getPendingProposerSpaceIds(submitters, extra);
  }, [unresolvedRankingEntityIds, aggregatedSubmitterSpaceIds, personalSpaceId, sharedAuthorSpaceId]);

  const { pendingEntityIds, pendingEntriesByEntityId, isPendingLoading } = useRankingPendingEntities({
    targetSpaceId: pendingTargetSpaceId,
    unresolvedEntityIds: pendingCandidateEntityIds,
    proposerSpaceIds: pendingProposerSpaceIds,
  });

  // An unresolved row's name may still arrive from the entity store or the
  // pending-proposal fetch. While that's in flight, render a skeleton instead of
  // flashing "Untitled" — on a throttled shortlink the seed can carry "Untitled"
  // for governance-pending or cross-space entries until the live data lands.
  const entriesResolving = isLoadingGlobalEntries || isLoadingMyEntries || isPendingLoading;

  const globalRankingEntryByEntityId = React.useMemo(() => {
    if (pendingEntriesByEntityId.size === 0) return globalRankingEntryByEntityIdBase;
    const map = new Map(globalRankingEntryByEntityIdBase);
    for (const [id, entry] of pendingEntriesByEntityId) {
      if (isPlaceholderRankingEntry(map.get(id))) map.set(id, entry);
    }
    return map;
  }, [globalRankingEntryByEntityIdBase, pendingEntriesByEntityId]);

  const myRankingEntryByEntityId = React.useMemo(() => {
    if (pendingEntriesByEntityId.size === 0) return myRankingEntryByEntityIdBase;
    const map = new Map(myRankingEntryByEntityIdBase);
    for (const [id, entry] of pendingEntriesByEntityId) {
      if (isPlaceholderRankingEntry(map.get(id))) map.set(id, entry);
    }
    return map;
  }, [myRankingEntryByEntityIdBase, pendingEntriesByEntityId]);

  // Global ranks renumber contiguously over the visible (placeholder-free) list.
  const globalRankByEntityId = React.useMemo(
    () => new Map(visibleGlobalDisplayEntityIds.map((id, index) => [id, index + 1])),
    [visibleGlobalDisplayEntityIds]
  );

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
    // Mirror `displayedSubmission`'s precedence: when viewing our OWN ranking
    // (even via a `/r/{id}` share link), derive the version from the live
    // `mySubmission` so the `?v=` cache-buster tracks post-edit content. The
    // server-seeded `sharedOgVersion` is captured once by the resolver and never
    // updates after we edit/refetch, so preferring it here would leave the share
    // URL stuck on the pre-edit version and X wouldn't re-scrape. For someone
    // else's shared ranking the seeded version stays authoritative.
    const canDeriveFromMine = Boolean(mySubmission && shareRankEntityId);
    if (sharedOgVersion && !(isViewingOwnSharedRanking && canDeriveFromMine)) return sharedOgVersion;
    // Narrowing guard (equivalent to `!canDeriveFromMine`) so TS knows `mySubmission` is non-null below.
    if (!mySubmission || !shareRankEntityId) return sharedOgVersion;
    return buildRankingOgVersion({
      rankEntityId: shareRankEntityId,
      orderedEntityIds: mySubmission.orderedEntityIds,
      rankingName: displayName,
      rankingStartDate,
      rankingEndDate,
      authorName: mySubmission.author.name,
      authorAvatarUrl: mySubmission.author.avatarUrl,
    });
  }, [
    displayName,
    isViewingOwnSharedRanking,
    mySubmission,
    rankingEndDate,
    rankingStartDate,
    shareRankEntityId,
    sharedOgVersion,
  ]);
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
      ? buildShortPersonalRankingSharePath(shareRankEntityId, effectiveOgVersion)
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

  // Share-link visibility is unchanged: expose it whenever the block relation
  // resolves, just as before. Only attach the `?v=` cache-buster once relations
  // have hydrated (`globalRankingEntityIds.length > 0`) — before then
  // `effectiveGlobalOgVersion` hashes an empty list, so we'd emit a cache-buster
  // that wouldn't match the populated version once data arrives. With no version
  // the builder returns the bare `/r/g/{id}` path, matching prior behavior.
  const globalSharePath = effectiveRelationId
    ? buildShortGlobalRankingSharePath(
        entityId,
        globalRankingEntityIds.length > 0 ? effectiveGlobalOgVersion : undefined
      )
    : null;

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
    resolvedFilterState,
    filterMode,
    setFilterState,
    setFilterMode,
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
    totalGlobalRankingEntityCount: visibleGlobalDisplayEntityIds.length,
    globalRankByEntityId,
    showEmbeddedGlobalPagination,
    pageSize,
    embeddedGlobalPageNumber,
    hasEmbeddedGlobalPreviousPage,
    hasEmbeddedGlobalNextPage,
    setEmbeddedGlobalPage,
    globalEntriesById,
    globalRankingEntryByEntityId,
    pendingEntityIds,
    isLoadingGlobalEntries,
    entriesResolving,
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

'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { buildExploreFeedRows, type ExploreFeedRow } from '~/core/explore/explore-card-item';
import { normId } from '~/core/utils/norm-id';

import {
  CLAIM_RECORD_PAGE_SIZE,
  claimRecordFilters,
  fetchClaimRecordClaimsPage,
  fetchClaimRecordCounts,
  fetchClaimRecordDebatesPage,
  firstClaimRecordClaimsPageParam,
  mergeSortedRecordEntities,
  nextClaimRecordClaimsPageParam,
  type ClaimRecordSort,
  type RankedClaimRecordEntity,
} from './claim-record-query';

export { CLAIM_RECORD_PAGE_SIZE } from './claim-record-query';

const CLAIM_RECORD_STALE_TIME = 60_000;
const NO_ROWS: ExploreFeedRow[] = [];

function useVisibleRecordPage({
  recordKey,
  entityCount,
  queryHasNextPage,
  queryIsFetchingNextPage,
  queryIsError,
  refetch,
  fetchNextPage,
}: {
  recordKey: string;
  entityCount: number;
  queryHasNextPage: boolean;
  queryIsFetchingNextPage: boolean;
  queryIsError: boolean;
  refetch: () => Promise<unknown>;
  fetchNextPage: () => Promise<{ isError: boolean }>;
}) {
  const [page, setPage] = React.useState({ key: recordKey, visibleCount: CLAIM_RECORD_PAGE_SIZE });
  const visibleCount = page.key === recordKey ? page.visibleCount : CLAIM_RECORD_PAGE_SIZE;
  const hasNextPage = entityCount > visibleCount || queryHasNextPage;

  const revealNextPage = React.useCallback(() => {
    setPage(current => ({
      key: recordKey,
      visibleCount:
        (current.key === recordKey ? current.visibleCount : CLAIM_RECORD_PAGE_SIZE) + CLAIM_RECORD_PAGE_SIZE,
    }));
  }, [recordKey]);

  const fetchNext = React.useCallback(() => {
    if (queryIsError) {
      void refetch();
      return;
    }
    if (queryIsFetchingNextPage) return;

    // Every still-open branch must advance before another union slice is visible. A buffered 20
    // from each branch cannot prove the union's top 40: row 21 in either branch may outrank a row
    // already buffered from the other. Once each branch has K rows, its unseen rows cannot enter
    // the union's top K because that branch alone already has K rows ahead of them.
    if (queryHasNextPage) {
      void fetchNextPage().then(result => {
        if (!result.isError) revealNextPage();
      });
      return;
    }

    revealNextPage();
  }, [fetchNextPage, queryHasNextPage, queryIsError, queryIsFetchingNextPage, refetch, revealNextPage]);

  return { visibleCount, hasNextPage, fetchNextPage: fetchNext };
}

function rowsForEntities(
  entities: RankedClaimRecordEntity[],
  visibleCount: number,
  spaceIds: string[]
): ExploreFeedRow[] {
  if (entities.length === 0) return NO_ROWS;
  return entities.slice(0, visibleCount).flatMap(entity => {
    const matchingSpaceIds = entity.matchingSpaceIds?.length ? entity.matchingSpaceIds : spaceIds;
    return buildExploreFeedRows(
      [entity],
      new Set(matchingSpaceIds.map(normId)),
      // These records do not render a Join button, so there is no membership state to resolve.
      new Set()
    );
  });
}

/**
 * The claim page's Debates and Related claims record.
 *
 * The old path discovered every matching entity, fetched a score for every id, sorted them in the
 * browser, and then fetched the visible cards. This version asks the graph for Best-ranked card
 * pages directly. Topic matches and claims extracted from a direct debate remain separate indexed
 * branches; their pages are merged and deduped in Best order, while an aggregate relation query
 * counts the exact union independently. That separation lets Activity draw whichever list arrives
 * first instead of waiting for the slowest prerequisite.
 */
export function useClaimRecord({
  claimId,
  spaceId,
  topicIds,
  spaceIds,
  filterTopicIds = [],
  claimSort = 'best',
  debateSort = 'best',
  claimsEnabled = true,
  debatesEnabled = true,
  countsEnabled = true,
}: {
  claimId: string;
  spaceId: string;
  topicIds: string[];
  spaceIds?: string[];
  filterTopicIds?: string[];
  claimSort?: ClaimRecordSort;
  debateSort?: ClaimRecordSort;
  claimsEnabled?: boolean;
  debatesEnabled?: boolean;
  countsEnabled?: boolean;
}) {
  const selectedSpaceIds = spaceIds && spaceIds.length > 0 ? spaceIds : [spaceId];
  const topicKey = topicIds.map(normId).sort().join(',');
  const filterTopicKey = filterTopicIds.map(normId).sort().join(',');
  const spaceKey = selectedSpaceIds.map(normId).sort().join(',');
  const recordKey = `${normId(claimId)}:${spaceKey}:${topicKey}:${filterTopicKey}`;
  const filters = React.useMemo(
    () => claimRecordFilters({ claimId, spaceIds: selectedSpaceIds, topicIds, filterTopicIds }),
    // Topic/space order and UUID formatting do not change the query's meaning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [claimId, spaceKey, topicKey, filterTopicKey]
  );

  const counts = useQuery({
    queryKey: ['claim-record', 'counts', recordKey],
    enabled: countsEnabled,
    queryFn: ({ signal }) => fetchClaimRecordCounts({ filters, signal }),
    staleTime: CLAIM_RECORD_STALE_TIME,
  });

  const claims = useInfiniteQuery({
    queryKey: ['claim-record', 'claims', recordKey, claimSort],
    enabled: claimsEnabled,
    initialPageParam: firstClaimRecordClaimsPageParam(filters.hasTopics),
    queryFn: ({ pageParam, signal }) =>
      fetchClaimRecordClaimsPage({ filters, spaceIds: selectedSpaceIds, sort: claimSort, pageParam, signal }),
    getNextPageParam: nextClaimRecordClaimsPageParam,
    staleTime: CLAIM_RECORD_STALE_TIME,
  });

  const debates = useInfiniteQuery({
    queryKey: ['claim-record', 'debates', recordKey, debateSort],
    enabled: debatesEnabled,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      fetchClaimRecordDebatesPage({ filters, spaceIds: selectedSpaceIds, sort: debateSort, after: pageParam, signal }),
    getNextPageParam: page => (page.hasNextPage && page.endCursor !== null ? page.endCursor : undefined),
    staleTime: CLAIM_RECORD_STALE_TIME,
  });

  const claimEntities = React.useMemo(() => {
    const pages = claims.data?.pages ?? [];
    return mergeSortedRecordEntities(
      claimSort,
      pages.flatMap(page => page.topicClaims.entities),
      pages.flatMap(page => page.extractedClaims.entities)
    );
  }, [claimSort, claims.data?.pages]);
  const debateEntities = React.useMemo(
    () => mergeSortedRecordEntities(debateSort, ...(debates.data?.pages ?? []).map(page => page.entities)),
    [debateSort, debates.data?.pages]
  );

  const claimsPage = useVisibleRecordPage({
    recordKey: `${recordKey}:${claimSort}`,
    entityCount: claimEntities.length,
    queryHasNextPage: Boolean(claims.hasNextPage),
    queryIsFetchingNextPage: claims.isFetchingNextPage,
    queryIsError: claims.isError,
    refetch: claims.refetch,
    fetchNextPage: claims.fetchNextPage,
  });
  const debatesPage = useVisibleRecordPage({
    recordKey: `${recordKey}:${debateSort}`,
    entityCount: debateEntities.length,
    queryHasNextPage: Boolean(debates.hasNextPage),
    queryIsFetchingNextPage: debates.isFetchingNextPage,
    queryIsError: debates.isError,
    refetch: debates.refetch,
    fetchNextPage: debates.fetchNextPage,
  });

  const claimRows = React.useMemo(
    () => rowsForEntities(claimEntities, claimsPage.visibleCount, selectedSpaceIds),
    // `spaceKey` is the semantic identity; callers may rebuild the array around it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [claimEntities, claimsPage.visibleCount, spaceKey]
  );
  const debateRows = React.useMemo(
    () => rowsForEntities(debateEntities, debatesPage.visibleCount, selectedSpaceIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [debateEntities, debatesPage.visibleCount, spaceKey]
  );

  return {
    // Kept for the public hook shape; it now describes the bounded pages already fetched rather
    // than forcing an exhaustive id walk before Activity can appear.
    relatedClaimIds: claimEntities.map(entity => entity.id),
    claimRows,
    debateRows,
    // Rows are a truthful lower bound while the independent exact aggregate is still in flight.
    claimsTotal: counts.data?.claims ?? claimEntities.length,
    debatesTotal: counts.data?.debates ?? debateEntities.length,
    claimsCountUnavailable: counts.isError,
    debatesCountUnavailable: counts.isError,
    claimsLoading: claims.isLoading,
    debatesLoading: debates.isLoading,
    claimsError: claims.isError,
    debatesError: debates.isError,
    claimsFetchingNextPage: claims.isFetchingNextPage,
    debatesFetchingNextPage: debates.isFetchingNextPage,
    claimsHasNextPage: claimsPage.hasNextPage,
    debatesHasNextPage: debatesPage.hasNextPage,
    fetchNextClaimsPage: claimsPage.fetchNextPage,
    fetchNextDebatesPage: debatesPage.fetchNextPage,
  };
}

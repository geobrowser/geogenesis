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
  mergeRankedRecordEntities,
  nextClaimRecordClaimsPageParam,
  type RankedClaimRecordEntity,
} from './claim-record-query';

export { CLAIM_RECORD_PAGE_SIZE } from './claim-record-query';

const CLAIM_RECORD_STALE_TIME = 60_000;
const NO_ROWS: ExploreFeedRow[] = [];

function useVisibleRecordPage({
  recordKey,
  entityCount,
  queryHasNextPage,
  queryIsError,
  refetch,
  fetchNextPage,
}: {
  recordKey: string;
  entityCount: number;
  queryHasNextPage: boolean;
  queryIsError: boolean;
  refetch: () => Promise<unknown>;
  fetchNextPage: () => Promise<unknown>;
}) {
  const [page, setPage] = React.useState({ key: recordKey, visibleCount: CLAIM_RECORD_PAGE_SIZE });
  const visibleCount = page.key === recordKey ? page.visibleCount : CLAIM_RECORD_PAGE_SIZE;
  const hasNextPage = entityCount > visibleCount || queryHasNextPage;

  const fetchNext = React.useCallback(() => {
    if (queryIsError) {
      void refetch();
      return;
    }

    const nextVisibleCount = visibleCount + CLAIM_RECORD_PAGE_SIZE;
    setPage({ key: recordKey, visibleCount: nextVisibleCount });

    // Two ranked claim branches can provide a buffered page between them. Reveal that buffer
    // immediately, and only ask the graph for another cursor page when it cannot fill the next
    // visible page. This keeps scrolling bounded without adding an avoidable request per click.
    if (entityCount < nextVisibleCount && queryHasNextPage) void fetchNextPage();
  }, [entityCount, fetchNextPage, queryHasNextPage, queryIsError, recordKey, refetch, visibleCount]);

  return { visibleCount, hasNextPage, fetchNextPage: fetchNext };
}

function rowsForEntities(entities: RankedClaimRecordEntity[], visibleCount: number, spaceId: string): ExploreFeedRow[] {
  if (entities.length === 0) return NO_ROWS;
  return buildExploreFeedRows(
    entities.slice(0, visibleCount),
    new Set([normId(spaceId)]),
    // These records do not render a Join button, so there is no membership state to resolve.
    new Set()
  );
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
}: {
  claimId: string;
  spaceId: string;
  topicIds: string[];
}) {
  const topicKey = topicIds.map(normId).sort().join(',');
  const recordKey = `${normId(spaceId)}:${normId(claimId)}:${topicKey}`;
  const filters = React.useMemo(
    () => claimRecordFilters({ claimId, spaceId, topicIds }),
    // Topic order and UUID formatting do not change the query's meaning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [claimId, spaceId, topicKey]
  );

  const counts = useQuery({
    queryKey: ['claim-record', 'counts', recordKey],
    queryFn: ({ signal }) => fetchClaimRecordCounts({ filters, signal }),
    staleTime: CLAIM_RECORD_STALE_TIME,
  });

  const claims = useInfiniteQuery({
    queryKey: ['claim-record', 'claims', recordKey],
    initialPageParam: firstClaimRecordClaimsPageParam(filters.hasTopics),
    queryFn: ({ pageParam, signal }) =>
      fetchClaimRecordClaimsPage({ filters, spaceId, pageParam, signal }),
    getNextPageParam: nextClaimRecordClaimsPageParam,
    staleTime: CLAIM_RECORD_STALE_TIME,
  });

  const debates = useInfiniteQuery({
    queryKey: ['claim-record', 'debates', recordKey],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      fetchClaimRecordDebatesPage({ filters, spaceId, after: pageParam, signal }),
    getNextPageParam: page => (page.hasNextPage && page.endCursor !== null ? page.endCursor : undefined),
    staleTime: CLAIM_RECORD_STALE_TIME,
  });

  const claimEntities = React.useMemo(() => {
    const pages = claims.data?.pages ?? [];
    return mergeRankedRecordEntities(
      pages.flatMap(page => page.topicClaims.entities),
      pages.flatMap(page => page.extractedClaims.entities)
    );
  }, [claims.data?.pages]);
  const debateEntities = React.useMemo(
    () => mergeRankedRecordEntities(...(debates.data?.pages ?? []).map(page => page.entities)),
    [debates.data?.pages]
  );

  const claimsPage = useVisibleRecordPage({
    recordKey,
    entityCount: claimEntities.length,
    queryHasNextPage: Boolean(claims.hasNextPage),
    queryIsError: claims.isError,
    refetch: claims.refetch,
    fetchNextPage: claims.fetchNextPage,
  });
  const debatesPage = useVisibleRecordPage({
    recordKey,
    entityCount: debateEntities.length,
    queryHasNextPage: Boolean(debates.hasNextPage),
    queryIsError: debates.isError,
    refetch: debates.refetch,
    fetchNextPage: debates.fetchNextPage,
  });

  const claimRows = React.useMemo(
    () => rowsForEntities(claimEntities, claimsPage.visibleCount, spaceId),
    [claimEntities, claimsPage.visibleCount, spaceId]
  );
  const debateRows = React.useMemo(
    () => rowsForEntities(debateEntities, debatesPage.visibleCount, spaceId),
    [debateEntities, debatesPage.visibleCount, spaceId]
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

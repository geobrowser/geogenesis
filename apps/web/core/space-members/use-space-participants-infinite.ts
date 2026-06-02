'use client';

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import {
  type ParticipantKind,
  SPACE_PARTICIPANTS_PAGE_SIZE,
  type SpaceParticipantProfile,
  type SpaceParticipantsPage,
} from './fetch-space-participants-page';
import {
  getCachedParticipantsPage,
  spaceParticipantsQueryKey,
  seedSpaceParticipantsCache,
  type SpaceParticipantsInfiniteData,
  writeParticipantsPageToCache,
} from './space-participants-cache';

export type { SpaceParticipantProfile, ParticipantKind } from './fetch-space-participants-page';
export { spaceParticipantsQueryKey, seedSpaceParticipantsCache } from './space-participants-cache';

async function fetchPageFromApi({
  spaceId,
  kind,
  offset,
  limit,
  signal,
}: {
  spaceId: string;
  kind: ParticipantKind;
  offset: number;
  limit: number;
  signal?: AbortSignal;
}): Promise<SpaceParticipantsPage> {
  const sp = new URLSearchParams();
  sp.set('kind', kind);
  sp.set('offset', String(offset));
  sp.set('limit', String(limit));
  const res = await fetch(`/api/space/${encodeURIComponent(spaceId)}/participants?${sp.toString()}`, {
    credentials: 'include',
    signal,
  });
  if (!res.ok) {
    throw new Error(`failed to fetch space ${kind}`);
  }
  return res.json() as Promise<SpaceParticipantsPage>;
}

type UseSpaceParticipantsInfiniteArgs = {
  spaceId: string;
  kind: ParticipantKind;
  enabled?: boolean;
  pageSize?: number;
  initialPage?: SpaceParticipantsPage;
};

export function useSpaceParticipantsInfinite({
  spaceId,
  kind,
  enabled = true,
  pageSize = SPACE_PARTICIPANTS_PAGE_SIZE,
  initialPage,
}: UseSpaceParticipantsInfiniteArgs) {
  const queryClient = useQueryClient();
  const queryKey = spaceParticipantsQueryKey(spaceId, kind, pageSize);
  const hasServerPage = Boolean(initialPage);

  if (initialPage) {
    seedSpaceParticipantsCache(queryClient, { spaceId, kind, page: initialPage, pageSize });
  }

  const query = useInfiniteQuery({
    enabled,
    queryKey,
    queryFn: async ({ pageParam, signal }) => {
      const offset = pageParam as number;

      const cached = getCachedParticipantsPage(queryClient, spaceId, kind, offset, pageSize);
      if (cached) {
        return cached;
      }

      const page = await fetchPageFromApi({ spaceId, kind, offset, limit: pageSize, signal });
      writeParticipantsPageToCache(queryClient, { spaceId, kind, page, offset, pageSize });
      return page;
    },
    initialPageParam: 0,
    getNextPageParam: last => last.nextOffset ?? undefined,
    initialData: () =>
      queryClient.getQueryData<SpaceParticipantsInfiniteData>(queryKey) ?? undefined,
    staleTime: hasServerPage ? Number.POSITIVE_INFINITY : 0,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 2,
    retryDelay: attempt => Math.min(1000 * 2 ** attempt, 8000),
  });

  const participants = React.useMemo<SpaceParticipantProfile[]>(() => {
    const flat: SpaceParticipantProfile[] = [];
    for (const page of query.data?.pages ?? []) flat.push(...page.participants);
    return flat;
  }, [query.data?.pages]);

  const totalCount = query.data?.pages[0]?.totalCount ?? initialPage?.totalCount ?? 0;

  return {
    participants,
    totalCount,
    isLoading: query.isLoading && !query.data,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    error: query.error,
  };
}

export function useInfiniteScrollSentinel({
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  rootMargin = '200px',
}: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
  rootMargin?: string;
}) {
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, rootMargin]);

  return sentinelRef;
}

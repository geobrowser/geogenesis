'use client';

import { useInfiniteQuery } from '@tanstack/react-query';

import * as React from 'react';

import {
  type ParticipantKind,
  SPACE_PARTICIPANTS_PAGE_SIZE,
  type SpaceParticipantProfile,
  type SpaceParticipantsPage,
} from './fetch-space-participants-page';

export type { SpaceParticipantProfile, ParticipantKind } from './fetch-space-participants-page';

async function fetchPage({
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
};

export function useSpaceParticipantsInfinite({
  spaceId,
  kind,
  enabled = true,
  pageSize = SPACE_PARTICIPANTS_PAGE_SIZE,
}: UseSpaceParticipantsInfiniteArgs) {
  const query = useInfiniteQuery({
    enabled,
    queryKey: ['space-participants', spaceId, kind, pageSize],
    queryFn: ({ pageParam, signal }) =>
      fetchPage({ spaceId, kind, offset: pageParam as number, limit: pageSize, signal }),
    initialPageParam: 0,
    getNextPageParam: last => last.nextOffset ?? undefined,
    retry: 2,
    retryDelay: attempt => Math.min(1000 * 2 ** attempt, 8000),
  });

  const participants = React.useMemo<SpaceParticipantProfile[]>(() => {
    const flat: SpaceParticipantProfile[] = [];
    for (const page of query.data?.pages ?? []) flat.push(...page.participants);
    return flat;
  }, [query.data?.pages]);

  // The chip and the popover/dialog footers all read this. It's authoritative
  // because it comes from the GraphQL `totalCount`, not the loaded page length.
  const totalCount = query.data?.pages[0]?.totalCount ?? 0;

  return {
    participants,
    totalCount,
    isLoading: query.isLoading,
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

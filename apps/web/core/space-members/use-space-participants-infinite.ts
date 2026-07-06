'use client';

import { type InfiniteData, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import {
  type ParticipantKind,
  SPACE_PARTICIPANTS_PAGE_SIZE,
  type SpaceParticipantProfile,
  type SpaceParticipantsPage,
} from './fetch-space-participants-page';

export type { SpaceParticipantProfile, ParticipantKind } from './fetch-space-participants-page';

export function spaceParticipantsQueryKey(
  spaceId: string,
  kind: ParticipantKind,
  pageSize: number = SPACE_PARTICIPANTS_PAGE_SIZE
) {
  return ['space-participants', spaceId, kind, pageSize] as const;
}

type SpaceParticipantsInfiniteData = InfiniteData<SpaceParticipantsPage, number>;

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

  const query = useInfiniteQuery({
    enabled,
    queryKey,
    queryFn: ({ pageParam, signal }) =>
      fetchPageFromApi({ spaceId, kind, offset: pageParam as number, limit: pageSize, signal }),
    initialPageParam: 0,
    getNextPageParam: last => last.nextOffset ?? undefined,
    // Bootstrap from the server-rendered page 0 without mutating the cache during
    // render. React Query persists this initialData into the shared cache, so the
    // chip, popover, and manage dialog all read the same seeded page 0.
    initialData: (): SpaceParticipantsInfiniteData | undefined => {
      const existing = queryClient.getQueryData<SpaceParticipantsInfiniteData>(queryKey);
      if (existing) return existing;
      if (initialPage) return { pages: [initialPage], pageParams: [0] };
      return undefined;
    },
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 2,
    retryDelay: attempt => Math.min(1000 * 2 ** attempt, 8000),
  });

  const participants = React.useMemo<SpaceParticipantProfile[]>(() => {
    const flat: SpaceParticipantProfile[] = [];
    for (const page of query.data?.pages ?? []) flat.push(...page.participants);
    return flat;
  }, [query.data?.pages]);

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
  root = null,
}: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
  rootMargin?: string;
  /** Scroll container for nested overflow lists; defaults to the viewport when omitted. */
  root?: Element | null;
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
      { root, rootMargin }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, root, rootMargin]);

  return sentinelRef;
}

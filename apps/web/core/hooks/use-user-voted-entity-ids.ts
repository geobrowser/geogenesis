'use client';

import { type InfiniteData, useInfiniteQuery, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { ID } from '~/core/id';
import { type UserEntityVoteObjectIdsPage, getUserEntityVoteObjectIdsPage } from '~/core/io/queries';

export type EntityVoteDirectionFilter = 'up' | 'down';

const VOTE_TYPE_BY_DIRECTION: Record<EntityVoteDirectionFilter, 0 | 1> = {
  up: 0,
  down: 1,
};

export const USER_ENTITY_VOTES_QUERY_KEY_ROOT = 'user-entity-votes';

export function userEntityVotesQueryKey(
  personalSpaceId: string | null | undefined,
  direction: EntityVoteDirectionFilter
) {
  return [USER_ENTITY_VOTES_QUERY_KEY_ROOT, personalSpaceId ?? null, direction] as const;
}

export type UserVotedEntityIdsCache = InfiniteData<UserEntityVoteObjectIdsPage>;

/**
 * Ids a vote has taken out of this list, held beside the list itself.
 */
export function votedEntityIdsRemovedQueryKey(
  personalSpaceId: string | null | undefined,
  direction: EntityVoteDirectionFilter
) {
  return [...userEntityVotesQueryKey(personalSpaceId, direction), 'removed'] as const;
}

export function addRemovedVotedId(removed: string[], entityId: string): string[] {
  return removed.some(id => ID.equals(id, entityId)) ? removed : [...removed, entityId];
}

export function clearRemovedVotedId(removed: string[], entityId: string): string[] {
  const next = removed.filter(id => !ID.equals(id, entityId));
  return next.length === removed.length ? removed : next;
}

const MAX_CACHED_VOTE_PAGES = 4;

export type VotedIdPage = {
  param: string | null;
  objectIds: string[];
  voteKindByObjectId: Record<string, number>;
  votedAtByObjectId: Record<string, string>;
};

/**
 * Folds the pages currently in the cache into everything fetched so far.
 */
export function mergeVotedIdPages(previous: VotedIdPage[], incoming: VotedIdPage[]): VotedIdPage[] {
  let changed = false;
  const merged = [...previous];

  for (const page of incoming) {
    const index = merged.findIndex(existing => existing.param === page.param);

    if (index === -1) {
      merged.push(page);
      changed = true;
      continue;
    }

    const existing = merged[index];
    if (
      existing.objectIds.length === page.objectIds.length &&
      existing.objectIds.every((id, i) => id === page.objectIds[i])
    ) {
      continue;
    }

    merged[index] = page;
    changed = true;
  }

  return changed ? merged : previous;
}

export function sortVotedIdsByVotedAtDesc(objectIds: string[], votedAtByObjectId: Record<string, string>): string[] {
  return [...objectIds].sort((a, b) => {
    const aAt = votedAtByObjectId[a] ?? '';
    const bAt = votedAtByObjectId[b] ?? '';
    if (aAt === bAt) return a < b ? -1 : a > b ? 1 : 0;
    return aAt < bAt ? 1 : -1;
  });
}

export function removeEntityFromVotedIds(
  cache: UserVotedEntityIdsCache | undefined,
  entityId: string
): UserVotedEntityIdsCache | undefined {
  if (!cache) return cache;

  let removed = false;
  const pages = cache.pages.map(page => {
    const objectIds = page.objectIds.filter(id => !ID.equals(id, entityId));
    if (objectIds.length === page.objectIds.length) return page;
    removed = true;
    return { ...page, objectIds };
  });

  return removed ? { ...cache, pages } : cache;
}

export function useUserVotedEntityIds(direction: EntityVoteDirectionFilter, enabled = true) {
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();
  const voteType = VOTE_TYPE_BY_DIRECTION[direction];
  const canFetch = enabled && Boolean(personalSpaceId) && isRegistered;

  const query = useInfiniteQuery({
    queryKey: userEntityVotesQueryKey(personalSpaceId, direction),
    queryFn: async ({ pageParam, signal }) => {
      if (!personalSpaceId) {
        return {
          objectIds: [],
          voteKindByObjectId: {},
          votedAtByObjectId: {},
          endCursor: null,
          hasNextPage: false,
        } satisfies UserEntityVoteObjectIdsPage;
      }
      return Effect.runPromise(getUserEntityVoteObjectIdsPage(personalSpaceId, voteType, 0, pageParam, signal));
    },
    initialPageParam: null as string | null,
    getNextPageParam: lastPage => (lastPage.hasNextPage ? lastPage.endCursor : undefined),
    enabled: canFetch,
    staleTime: 30_000,
    maxPages: MAX_CACHED_VOTE_PAGES,
  });

  const [fetchedPages, setFetchedPages] = React.useState<VotedIdPage[]>([]);

  const listKey = `${personalSpaceId ?? ''}:${direction}`;

  React.useEffect(() => {
    setFetchedPages([]);
  }, [listKey]);

  React.useEffect(() => {
    const data = query.data;
    if (!data) return;

    setFetchedPages(previous =>
      mergeVotedIdPages(
        previous,
        data.pages.map((page, index) => ({
          param: (data.pageParams[index] ?? null) as string | null,
          objectIds: page.objectIds,
          voteKindByObjectId: page.voteKindByObjectId,
          votedAtByObjectId: page.votedAtByObjectId,
        }))
      )
    );
  }, [query.data]);

  const { data: removedIds } = useQuery({
    queryKey: votedEntityIdsRemovedQueryKey(personalSpaceId, direction),
    queryFn: () => [] as string[],
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const suppressed = React.useMemo(() => new Set((removedIds ?? []).map(ID.uuidToHex)), [removedIds]);

  // Per-page slices for entity hydration; `ids` is the same set re-sorted by votedAt.
  const { idPages, ids } = React.useMemo(() => {
    const seen = new Set<string>();
    const pages: string[][] = [];
    const votedAtById: Record<string, string> = {};

    for (const page of fetchedPages) {
      Object.assign(votedAtById, page.votedAtByObjectId);
      const pageIds: string[] = [];

      for (const id of page.objectIds) {
        if (!id) continue;
        const hexId = ID.uuidToHex(id);
        if (seen.has(hexId) || suppressed.has(hexId)) continue;
        seen.add(hexId);
        pageIds.push(hexId);
      }

      pages.push(pageIds);
    }

    return { idPages: pages, ids: sortVotedIdsByVotedAtDesc(pages.flat(), votedAtById) };
  }, [fetchedPages, suppressed]);

  const voteKindById = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const page of fetchedPages) {
      for (const [id, voteKind] of Object.entries(page.voteKindByObjectId)) {
        map.set(id, voteKind);
      }
    }
    return map;
  }, [fetchedPages]);

  return {
    ids,
    idPages,
    voteKindById,
    isLoading: canFetch && query.isLoading,
    hasNextPage: Boolean(query.hasNextPage) && !query.isError,
    isFetchingNextPage: query.isFetchingNextPage,
    isError: query.isError,
    refetch: query.refetch,
    fetchNextPage: query.fetchNextPage,
  };
}

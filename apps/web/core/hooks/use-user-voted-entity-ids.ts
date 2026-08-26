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

export const USER_ENTITY_VOTES_PENDING_QUERY_KEY_ROOT = 'user-entity-votes-pending';

/**
 * Votes the viewer has cast that the indexer hasn't caught up with yet, held
 * beside the server list rather than under its key: invalidating the list must
 * never reach these, or a refetch would wipe every override at once.
 */
export function votedEntityIdsPendingQueryKey(
  personalSpaceId: string | null | undefined,
  direction: EntityVoteDirectionFilter
) {
  return [USER_ENTITY_VOTES_PENDING_QUERY_KEY_ROOT, personalSpaceId ?? null, direction] as const;
}

export type PendingVotedEntry = { entityId: string; voteKind: number; votedAt: string };

export type PendingVotedOverrides = {
  /** Votes to show before the server list has them. */
  added: PendingVotedEntry[];
  /** Votes to hide while the server list still has them. */
  removed: string[];
};

export const EMPTY_PENDING_VOTED_OVERRIDES: PendingVotedOverrides = { added: [], removed: [] };

/** The entity left this list — hide it until the server agrees. */
export function suppressVotedId(overrides: PendingVotedOverrides, entityId: string): PendingVotedOverrides {
  const added = overrides.added.filter(entry => !ID.equals(entry.entityId, entityId));
  const isSuppressed = overrides.removed.some(id => ID.equals(id, entityId));
  if (isSuppressed && added.length === overrides.added.length) return overrides;
  return { added, removed: isSuppressed ? overrides.removed : [...overrides.removed, entityId] };
}

/** The entity joined this list — show it until the server has it. */
export function restorePendingVotedEntry(
  overrides: PendingVotedOverrides,
  entry: PendingVotedEntry
): PendingVotedOverrides {
  return {
    added: [entry, ...overrides.added.filter(existing => !ID.equals(existing.entityId, entry.entityId))],
    removed: overrides.removed.filter(id => !ID.equals(id, entry.entityId)),
  };
}

/** Indexing caught up: the server list is now the source of truth for this entity. */
export function clearPendingVotedEntity(overrides: PendingVotedOverrides, entityId: string): PendingVotedOverrides {
  const added = overrides.added.filter(entry => !ID.equals(entry.entityId, entityId));
  const removed = overrides.removed.filter(id => !ID.equals(id, entityId));
  if (added.length === overrides.added.length && removed.length === overrides.removed.length) return overrides;
  return { added, removed };
}

const MAX_CACHED_VOTE_PAGES = 4;

const EMPTY_VOTED_ID_PAGES: VotedIdPage[] = [];

export type VotedIdPage = {
  param: number;
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
          nextOffset: 0,
          hasNextPage: false,
        } satisfies UserEntityVoteObjectIdsPage;
      }
      return Effect.runPromise(getUserEntityVoteObjectIdsPage(personalSpaceId, voteType, 0, pageParam, signal));
    },
    initialPageParam: 0,
    getNextPageParam: lastPage => (lastPage.hasNextPage ? lastPage.nextOffset : undefined),
    enabled: canFetch,
    staleTime: 30_000,
    maxPages: MAX_CACHED_VOTE_PAGES,
  });

  // Accumulated pages kept per list rather than wiped on direction switch: the
  // query cache retains only the trailing MAX_CACHED_VOTE_PAGES pages, so a
  // wiped accumulation could only rebuild from that window and would lose
  // every page fetched before it.
  const [fetchedPagesByList, setFetchedPagesByList] = React.useState<Record<string, VotedIdPage[]>>({});

  const listKey = `${personalSpaceId ?? ''}:${direction}`;
  const fetchedPages = fetchedPagesByList[listKey] ?? EMPTY_VOTED_ID_PAGES;

  React.useEffect(() => {
    const data = query.data;
    if (!data) return;

    setFetchedPagesByList(previous => {
      const current = previous[listKey] ?? EMPTY_VOTED_ID_PAGES;
      const merged = mergeVotedIdPages(
        current,
        data.pages.map((page, index) => ({
          param: (data.pageParams[index] ?? 0) as number,
          objectIds: page.objectIds,
          voteKindByObjectId: page.voteKindByObjectId,
          votedAtByObjectId: page.votedAtByObjectId,
        }))
      );
      return merged === current ? previous : { ...previous, [listKey]: merged };
    });
  }, [query.data, listKey]);

  const { data: pendingOverrides } = useQuery({
    queryKey: votedEntityIdsPendingQueryKey(personalSpaceId, direction),
    queryFn: () => EMPTY_PENDING_VOTED_OVERRIDES,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const overrides = pendingOverrides ?? EMPTY_PENDING_VOTED_OVERRIDES;

  // Per-page slices for entity hydration; `ids` is the same set re-sorted by votedAt.
  const { idPages, ids, voteKindById } = React.useMemo(() => {
    const suppressed = new Set(overrides.removed.map(ID.uuidToHex));
    const seen = new Set<string>();
    const pages: string[][] = [];
    const votedAtById: Record<string, string> = {};
    const voteKinds = new Map<string, number>();

    // Votes still being indexed lead the first page, so they hydrate along with
    // it and fall away on their own once the server list carries them.
    const pendingIds: string[] = [];
    for (const entry of overrides.added) {
      const hexId = ID.uuidToHex(entry.entityId);
      if (!hexId || seen.has(hexId) || suppressed.has(hexId)) continue;
      seen.add(hexId);
      pendingIds.push(hexId);
    }

    for (const page of fetchedPages) {
      Object.assign(votedAtById, page.votedAtByObjectId);
      for (const [id, voteKind] of Object.entries(page.voteKindByObjectId)) {
        voteKinds.set(id, voteKind);
      }
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

    // The pending vote is the newest one the viewer cast, so its own votedAt and
    // kind win over whatever the server last said about that entity.
    for (const entry of overrides.added) {
      const hexId = ID.uuidToHex(entry.entityId);
      if (!pendingIds.includes(hexId)) continue;
      votedAtById[hexId] = entry.votedAt;
      voteKinds.set(hexId, entry.voteKind);
    }

    if (pendingIds.length > 0) {
      pages[0] = pages.length > 0 ? [...pendingIds, ...pages[0]] : pendingIds;
    }

    return { idPages: pages, ids: sortVotedIdsByVotedAtDesc(pages.flat(), votedAtById), voteKindById: voteKinds };
  }, [fetchedPages, overrides]);

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

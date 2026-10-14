'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { createBatchLoader } from '~/core/io/batch-loader';
import { type Followers, fetchFollowers, followersQueryKey } from '~/core/io/subgraph/fetch-followers';
import type { FollowKind } from '~/core/topics/interested';
import { useFollowedEntities } from '~/core/topics/use-followed-topics';
import { normId } from '~/core/utils/norm-id';

/** Ids per request: a feed page of them fits in one, and the query stays a sane size. */
const BATCH_SIZE = 25;

/** One loader per viewer: each is a separate query, so their asks batch separately. */
const loaders = new Map<string, (id: string) => Promise<Followers>>();

/**
 * Every card asks for its own count, and a feed mounts many at once; asks made in the same tick go
 * out as one request. See `createBatchLoader`.
 */
function loadFollowers(entityId: string, viewerId?: string): Promise<Followers> {
  const group = viewerId ? normId(viewerId) : '';
  let load = loaders.get(group);
  if (!load) {
    load = createBatchLoader<Followers>({
      fetchBatch: ids => fetchFollowers(ids, viewerId),
      missing: () => ({ count: 0, viewerIndexed: false, followerIds: [] }),
      maxBatchSize: BATCH_SIZE,
    });
    loaders.set(group, load);
  }
  return load(normId(entityId));
}

/**
 * How many people follow a topic or a person, counting the viewer's own follow the moment it lands.
 *
 * The indexer trails a follow by seconds to minutes, so the count from it can still leave the viewer
 * out right after they follow, or still include them right after they unfollow. The viewer's part of
 * the count comes from their own follows instead, which update as soon as the write succeeds: the
 * others from the indexer, plus one if the viewer follows now.
 *
 * `kind: 'person'` for a person, so the viewer's own follow is read from their person follows.
 *
 * `null` until the count has loaded, so a control draws nothing rather than a zero that jumps.
 */
export function useFollowerCount(
  entityId: string,
  options: { kind?: FollowKind; enabled?: boolean } = {}
): number | null {
  return useFollowers(entityId, options)?.count ?? null;
}

/**
 * The followers themselves as well as how many, with the viewer's own follow applied to both the
 * same way; see `useFollowerCount`. `null` until loaded.
 */
export function useFollowers(
  entityId: string,
  { kind = 'topic', enabled = true }: { kind?: FollowKind; enabled?: boolean } = {}
): { count: number; ids: string[] } | null {
  const { personalSpaceId } = usePersonalSpaceId();
  const { topicIds: followedIds, isLoading: isLoadingFollows } = useFollowedEntities({ kind });
  const viewerId = personalSpaceId ?? undefined;

  const { data, isError } = useQuery({
    queryKey: followersQueryKey(entityId, viewerId),
    queryFn: () => loadFollowers(entityId, viewerId),
    staleTime: 60_000,
    enabled,
  });

  return React.useMemo(() => {
    // A count that was never read draws as none rather than loading forever. One that was read and
    // then failed to refresh keeps what it had: React Query holds the last good data through an error.
    if (!data) return isError ? { count: 0, ids: [] } : null;
    if (!viewerId || isLoadingFollows) return { count: data.count, ids: data.followerIds };
    return followersForViewer(data, viewerId, followedIds.has(normId(entityId)));
  }, [data, isError, viewerId, isLoadingFollows, followedIds, entityId]);
}

/** A topic's follower count; see `useFollowerCount`. */
export function useTopicFollowerCount(topicId: string): number | null {
  return useFollowerCount(topicId);
}

/** The indexed followers with the viewer's part swapped for what they hold now: count and list alike. */
export function followersForViewer(
  followers: Followers,
  viewerId: string,
  followsNow: boolean
): { count: number; ids: string[] } {
  const viewer = normId(viewerId);
  const others = followers.followerIds.filter(id => id !== viewer);
  return { count: followerCountForViewer(followers, followsNow), ids: followsNow ? [viewer, ...others] : others };
}

/** The indexed count with the viewer's part swapped for what they hold now. */
export function followerCountForViewer(followers: Followers, followsNow: boolean): number {
  return Math.max(0, followers.count - (followers.viewerIndexed ? 1 : 0) + (followsNow ? 1 : 0));
}

'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { type Followers, fetchFollowers, followersQueryKey } from '~/core/io/subgraph/fetch-followers';
import { isInterestedFollowEnabled } from '~/core/topics/interested';
import { useFollowedInterests, useFollowedTopics } from '~/core/topics/use-followed-topics';
import { normId } from '~/core/utils/norm-id';

/** Topics per request: a feed page of them fits in one, and the query stays a sane size. */
const BATCH_SIZE = 25;

type Waiter = { resolve: (followers: Followers) => void; reject: (error: unknown) => void };
type Batch = { interested: boolean; viewerId?: string; waiters: Map<string, Waiter[]> };

/** Asks waiting for the next flush, one batch per (flag, viewer): those go out as separate queries. */
const batches = new Map<string, Batch>();
let flushScheduled = false;

/**
 * Every topic card asks for its own count, and a feed mounts many at once. Asks made in the same
 * tick go out as one request rather than one each.
 */
function loadFollowers(topicId: string, interested: boolean, viewerId?: string): Promise<Followers> {
  return new Promise((resolve, reject) => {
    const batchKey = `${interested}:${viewerId ? normId(viewerId) : ''}`;
    const batch = batches.get(batchKey) ?? { interested, viewerId, waiters: new Map() };
    batches.set(batchKey, batch);

    const id = normId(topicId);
    batch.waiters.set(id, [...(batch.waiters.get(id) ?? []), { resolve, reject }]);

    if (flushScheduled) return;
    flushScheduled = true;
    setTimeout(flush, 0);
  });
}

function flush() {
  flushScheduled = false;
  const pending = [...batches.values()];
  batches.clear();

  for (const { interested, viewerId, waiters } of pending) {
    const entries = [...waiters.entries()];
    for (let start = 0; start < entries.length; start += BATCH_SIZE) {
      const chunk = entries.slice(start, start + BATCH_SIZE);
      fetchFollowers(
        chunk.map(([id]) => id),
        interested,
        viewerId
      ).then(
        followers => {
          for (const [id, topicWaiters] of chunk) {
            const result = followers.get(id) ?? { count: 0, viewerIndexed: false, followerIds: [] };
            topicWaiters.forEach(waiter => waiter.resolve(result));
          }
        },
        error => chunk.forEach(([, topicWaiters]) => topicWaiters.forEach(waiter => waiter.reject(error)))
      );
    }
  }
}

/**
 * How many people follow a topic or a person, counting the viewer's own follow the moment it lands.
 *
 * The indexer trails a follow by seconds to minutes, so the count from it can still leave the viewer
 * out right after they follow, or still include them right after they unfollow. The viewer's part of
 * the count comes from their own follows instead, which update as soon as the write succeeds: the
 * others from the indexer, plus one if the viewer follows now.
 *
 * `interestedOnly` for a person, whose follows are only ever Interested votes. A topic reads
 * whichever kind the Interested flag writes.
 *
 * `null` until the count has loaded, so a control draws nothing rather than a zero that jumps.
 */
export function useFollowerCount(
  entityId: string,
  options: { interestedOnly?: boolean; enabled?: boolean } = {}
): number | null {
  return useFollowers(entityId, options)?.count ?? null;
}

/**
 * The followers themselves as well as how many, with the viewer's own follow applied to both the
 * same way; see `useFollowerCount`. `null` until loaded.
 */
export function useFollowers(
  entityId: string,
  { interestedOnly = false, enabled = true }: { interestedOnly?: boolean; enabled?: boolean } = {}
): { count: number; ids: string[] } | null {
  const interested = interestedOnly || isInterestedFollowEnabled();
  const { personalSpaceId } = usePersonalSpaceId();
  const topicFollows = useFollowedTopics();
  const interestFollows = useFollowedInterests();
  const { ids: followedIds, isLoading: isLoadingFollows } = interestedOnly
    ? interestFollows
    : { ids: topicFollows.topicIds, isLoading: topicFollows.isLoading };
  const viewerId = personalSpaceId ?? undefined;

  const { data } = useQuery({
    queryKey: followersQueryKey(entityId, interested, viewerId),
    queryFn: () => loadFollowers(entityId, interested, viewerId),
    staleTime: 60_000,
    enabled,
  });

  return React.useMemo(() => {
    if (!data) return null;
    if (!viewerId || isLoadingFollows) return { count: data.count, ids: data.followerIds };
    return followersForViewer(data, viewerId, followedIds.has(normId(entityId)));
  }, [data, viewerId, isLoadingFollows, followedIds, entityId]);
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

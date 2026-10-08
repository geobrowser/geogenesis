'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import {
  type TopicFollowers,
  fetchTopicFollowers,
  topicFollowersQueryKey,
} from '~/core/io/subgraph/fetch-topic-followers';
import { normId } from '~/core/utils/norm-id';

import { isInterestedFollowEnabled } from './interested';
import { useFollowedTopics } from './use-followed-topics';

/** Topics per request: a feed page of them fits in one, and the query stays a sane size. */
const BATCH_SIZE = 25;

type Waiter = { resolve: (followers: TopicFollowers) => void; reject: (error: unknown) => void };
type Batch = { interested: boolean; viewerId?: string; waiters: Map<string, Waiter[]> };

/** Asks waiting for the next flush, one batch per (flag, viewer): those go out as separate queries. */
const batches = new Map<string, Batch>();
let flushScheduled = false;

/**
 * Every topic card asks for its own count, and a feed mounts many at once. Asks made in the same
 * tick go out as one request rather than one each.
 */
function loadTopicFollowers(topicId: string, interested: boolean, viewerId?: string): Promise<TopicFollowers> {
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
      fetchTopicFollowers(
        chunk.map(([id]) => id),
        interested,
        viewerId
      ).then(
        followers => {
          for (const [id, topicWaiters] of chunk) {
            const result = followers.get(id) ?? { count: 0, viewerIndexed: false };
            topicWaiters.forEach(waiter => waiter.resolve(result));
          }
        },
        error => chunk.forEach(([, topicWaiters]) => topicWaiters.forEach(waiter => waiter.reject(error)))
      );
    }
  }
}

/**
 * How many people follow a topic, counting the viewer's own follow the moment it lands.
 *
 * The indexer trails a follow by seconds to minutes, so the count from it can still leave the viewer
 * out right after they follow, or still include them right after they unfollow. The viewer's part of
 * the count comes from their own follows instead, which update as soon as the write succeeds: the
 * others from the indexer, plus one if the viewer follows now.
 *
 * `null` until the count has loaded, so a control draws nothing rather than a zero that jumps.
 */
export function useTopicFollowerCount(topicId: string): number | null {
  const interested = isInterestedFollowEnabled();
  const { personalSpaceId } = usePersonalSpaceId();
  const { topicIds: followedTopicIds, isLoading: isLoadingFollows } = useFollowedTopics();
  const viewerId = personalSpaceId ?? undefined;

  const { data } = useQuery({
    queryKey: topicFollowersQueryKey(topicId, interested, viewerId),
    queryFn: () => loadTopicFollowers(topicId, interested, viewerId),
    staleTime: 60_000,
  });

  return React.useMemo(() => {
    if (!data) return null;
    if (!viewerId || isLoadingFollows) return data.count;
    return followerCountForViewer(data, followedTopicIds.has(normId(topicId)));
  }, [data, viewerId, isLoadingFollows, followedTopicIds, topicId]);
}

/** The indexed count with the viewer's part swapped for what they hold now. */
export function followerCountForViewer(followers: TopicFollowers, followsNow: boolean): number {
  return Math.max(0, followers.count - (followers.viewerIndexed ? 1 : 0) + (followsNow ? 1 : 0));
}

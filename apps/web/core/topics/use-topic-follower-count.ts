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

/** Aliases per request: a feed page of topics fits in one, and the query stays a sane size. */
const BATCH_SIZE = 25;

type Waiter = { resolve: (followers: TopicFollowers) => void; reject: (error: unknown) => void };

const queued = new Map<string, Waiter[]>();
let flushScheduled = false;

/**
 * Every topic card asks for its own count, and a feed mounts many at once. Asks made in the same
 * tick go out as one request rather than one each.
 */
function loadTopicFollowers(topicId: string, interested: boolean): Promise<TopicFollowers> {
  return new Promise((resolve, reject) => {
    const key = `${interested ? 'i' : 'f'}:${normId(topicId)}`;
    queued.set(key, [...(queued.get(key) ?? []), { resolve, reject }]);
    if (flushScheduled) return;
    flushScheduled = true;
    setTimeout(flush, 0);
  });
}

function flush() {
  flushScheduled = false;
  const batch = [...queued.entries()];
  queued.clear();

  for (const interested of [true, false]) {
    const prefix = interested ? 'i:' : 'f:';
    const entries = batch.filter(([key]) => key.startsWith(prefix));
    for (let start = 0; start < entries.length; start += BATCH_SIZE) {
      const chunk = entries.slice(start, start + BATCH_SIZE);
      const topicIds = chunk.map(([key]) => key.slice(prefix.length));
      fetchTopicFollowers(topicIds, interested).then(
        followers => {
          for (const [key, waiters] of chunk) {
            const result = followers.get(key.slice(prefix.length)) ?? { followerIds: [], count: 0 };
            waiters.forEach(waiter => waiter.resolve(result));
          }
        },
        error => chunk.forEach(([, waiters]) => waiters.forEach(waiter => waiter.reject(error)))
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

  const { data } = useQuery({
    queryKey: topicFollowersQueryKey(topicId, interested),
    queryFn: () => loadTopicFollowers(topicId, interested),
    staleTime: 60_000,
  });

  return React.useMemo(() => {
    if (!data) return null;
    if (!personalSpaceId || isLoadingFollows) return data.count;
    return followerCountForViewer(data, personalSpaceId, followedTopicIds.has(normId(topicId)));
  }, [data, personalSpaceId, isLoadingFollows, followedTopicIds, topicId]);
}

/** The indexed count with the viewer's part swapped for what they hold now. */
export function followerCountForViewer(followers: TopicFollowers, viewerSpaceId: string, followsNow: boolean): number {
  const indexed = followers.followerIds.includes(normId(viewerSpaceId));
  return Math.max(0, followers.count - (indexed ? 1 : 0) + (followsNow ? 1 : 0));
}

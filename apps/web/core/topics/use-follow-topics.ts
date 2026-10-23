'use client';

import { useMutation, useMutationState, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { readCachedSmartAccount } from '~/core/hooks/cached-write-identity';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { interestedTopicsQueryKey } from '~/core/io/subgraph/fetch-interested-topics';
import { SPACE_REGISTRY_ADDRESS_HEX } from '~/core/sdk/geo-network';
import { normId } from '~/core/utils/norm-id';

import {
  type FollowKind,
  type InterestedCall,
  type InterestedTopicRow,
  type TopicRef,
  buildInterestedClearCalls,
  buildInterestedFollowCalls,
  interestedTopicIds,
} from './interested';
import { interestedTopicsQueryOptions } from './use-followed-topics';

const FOLLOW_MUTATION_KEY = ['follow-topics'] as const;

/** One held Interested: an entity, in the space it was cast in. Clearing one names both. */
function heldKey(row: InterestedTopicRow) {
  return `${normId(row.objectId)}:${normId(row.spaceId)}`;
}

type FollowVariables = { spaceId: string; topicIds: string[]; followKind: FollowKind } & (
  { kind: 'follow'; topics: TopicRef[] } | { kind: 'unfollow' }
);

/**
 * A topic follow is an Interested vote (GEO-3158), cast from the viewer's personal space: one user
 * operation for the whole selection. A follow skips topics already held Interested, and an unfollow
 * clears every Interested on the topic. Topics already being written by any mounted control are
 * skipped. Resolves false when signed out, any requested topic is blocked, or the write failed.
 *
 * The old topic follow, a `Following` relation, is never written or read; existing ones are left
 * where they are and count for nothing.
 */
export function useFollowTopics() {
  return useFollowEntities({ kind: 'topic' });
}

/**
 * The follow writes for a topic or a person (GEO-3236, keyed by their personal space id): an
 * Interested vote either way. Every caller shares one mutation key, so a follow in flight shows as
 * saving on every control for it.
 */
export function useFollowEntities({ kind }: { kind: FollowKind }) {
  const followKind = kind;
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();
  const { smartAccount } = useSmartAccount();
  const queryClient = useQueryClient();

  const pendingIdLists = useMutationState({
    filters: { mutationKey: FOLLOW_MUTATION_KEY, status: 'pending' },
    select: mutation => (mutation.state.variables as FollowVariables | undefined)?.topicIds ?? [],
  });
  const pendingIds = React.useMemo(() => new Set(pendingIdLists.flat()), [pendingIdLists]);

  /** One user operation for every call; resolves false if there is no account or it fails. */
  const sendCalls = async (calls: InterestedCall[]) => {
    const account = readCachedSmartAccount(queryClient, smartAccount);
    if (!account) return false;
    try {
      await account.sendUserOperation({ calls: calls.map(call => ({ ...call, value: 0n })) });
      return true;
    } catch (error) {
      console.error('[follow-topics] Interested write failed:', error);
      return false;
    }
  };

  const write = async (variables: FollowVariables): Promise<boolean> => {
    const { spaceId } = variables;
    // Interested is an on-chain response from the personal space, which must exist on chain.
    if (!isRegistered) return false;
    const interested = await queryClient.ensureQueryData(interestedTopicsQueryOptions(spaceId));
    const interestedKey = interestedTopicsQueryKey(spaceId);

    if (variables.kind === 'follow') {
      const { calls, added } = buildInterestedFollowCalls({
        registry: SPACE_REGISTRY_ADDRESS_HEX,
        personalSpaceId: spaceId,
        topics: variables.topics,
        followedTopicIds: interestedTopicIds(interested),
      });
      if (calls.length === 0) return true;
      if (!(await sendCalls(calls))) return false;

      // A refetch started before the write would land the pre-write rows, and the indexer trails the
      // write, so cancel, then write what was sent; it stands until the query goes stale normally.
      await queryClient.cancelQueries({ queryKey: interestedKey, exact: true });
      queryClient.setQueryData<InterestedTopicRow[]>(interestedKey, current => {
        const kept = current ?? interested;
        const known = new Set(kept.map(row => normId(row.objectId)));
        return [
          ...kept,
          ...added.filter(row => !known.has(normId(row.objectId))).map(row => ({ ...row, kind: variables.followKind })),
        ];
      });
      return true;
    }

    const { calls, cleared } = buildInterestedClearCalls({
      registry: SPACE_REGISTRY_ADDRESS_HEX,
      personalSpaceId: spaceId,
      rows: interested,
      topicIds: variables.topicIds,
    });
    if (calls.length === 0) return true;
    if (!(await sendCalls(calls))) return false;

    await queryClient.cancelQueries({ queryKey: interestedKey, exact: true });
    const gone = new Set(cleared.map(heldKey));
    queryClient.setQueryData<InterestedTopicRow[]>(interestedKey, current =>
      (current ?? interested).filter(row => !gone.has(heldKey(row)))
    );
    return true;
  };

  const { mutateAsync } = useMutation({ mutationKey: FOLLOW_MUTATION_KEY, mutationFn: write });

  const run = React.useCallback(
    async (kind: FollowVariables['kind'], topics: readonly TopicRef[]) => {
      if (!personalSpaceId) return false;

      // Read synchronously: a mutation is registered as pending before
      // mutateAsync first yields, so a double click sees the first one here.
      const inFlight = new Set(
        queryClient
          .getMutationCache()
          .findAll({ mutationKey: FOLLOW_MUTATION_KEY, status: 'pending' })
          .flatMap(m => (m.state.variables as FollowVariables | undefined)?.topicIds ?? [])
      );
      const free = topics.filter(topic => !inFlight.has(normId(topic.id)));
      if (free.length === 0) return false;

      const topicIds = [...new Set(free.map(topic => normId(topic.id)))];
      try {
        const succeeded = await mutateAsync(
          kind === 'follow'
            ? { kind, spaceId: personalSpaceId, topicIds, topics: free, followKind }
            : { kind, spaceId: personalSpaceId, topicIds, followKind }
        );
        // A batch may have sent only its free topics. Callers retaining work for retry must not
        // discard the blocked ones: the other control's operation can still fail.
        return succeeded && free.length === topics.length;
      } catch (error) {
        console.error(`[follow-topics] ${kind} failed:`, error);
        return false;
      }
    },
    [mutateAsync, personalSpaceId, queryClient, followKind]
  );

  const follow = React.useCallback((topics: readonly TopicRef[]) => run('follow', topics), [run]);
  const unfollow = React.useCallback(
    (topicIds: readonly string[]) =>
      run(
        'unfollow',
        topicIds.map(id => ({ id }))
      ),
    [run]
  );
  const isPending = React.useCallback((topicId: string) => pendingIds.has(normId(topicId)), [pendingIds]);

  return { follow, unfollow, isPending, canFollow: !!personalSpaceId };
}

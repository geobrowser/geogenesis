'use client';

import { useMutation, useMutationState, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { reconcileDeletedRelations } from '~/core/bounties/reconcile-store';
import { readCachedSmartAccount } from '~/core/hooks/cached-write-identity';
import { publishOnce } from '~/core/hooks/publish-once';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { usePublish } from '~/core/hooks/use-publish';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { followedTopicsQueryKey } from '~/core/io/subgraph/fetch-followed-topics';
import { interestedTopicsQueryKey } from '~/core/io/subgraph/fetch-interested-topics';
import { SPACE_REGISTRY_ADDRESS_HEX } from '~/core/sdk/geo-network';
import type { Relation } from '~/core/types';
import { normId } from '~/core/utils/norm-id';

import {
  type FollowedTopicRelation,
  type TopicRef,
  buildFollowRelations,
  buildUnfollowRelations,
  followEditName,
} from './follow-ops';
import {
  type InterestedCall,
  type InterestedTopicRow,
  buildInterestedClearCalls,
  buildInterestedFollowCalls,
  interestedTopicIds,
  isInterestedFollowEnabled,
} from './interested';
import { followedTopicsQueryOptions, interestedTopicsQueryOptions } from './use-followed-topics';

const FOLLOW_MUTATION_KEY = ['follow-topics'] as const;

type FollowVariables =
  | { kind: 'follow'; spaceId: string; topicIds: string[]; topics: TopicRef[] }
  | { kind: 'unfollow'; spaceId: string; topicIds: string[] };

/**
 * One edit per call, published to the viewer's personal space. Topics already being written by any
 * mounted control are skipped. Resolves false when signed out, blocked, or the publish failed.
 *
 * With `NEXT_PUBLIC_INTERESTED_FOLLOW_ENABLED` (GEO-3158) a follow is an Interested instead: one
 * user operation for the whole selection, and no `Following` relation. Interested replaces the
 * relation entirely, so neither path reads or writes relations: a follow skips topics already held
 * Interested, and an unfollow clears every Interested on the topic. Old `Following` relations are
 * left where they are and count for nothing. Flag off, nothing here reads or writes Interested.
 */
export function useFollowTopics() {
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();
  const { makeProposal } = usePublish();
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

  const runInterested = async (variables: FollowVariables, interested: InterestedTopicRow[]): Promise<boolean> => {
    const { spaceId } = variables;
    // Interested is an on-chain response from the personal space, which must exist on chain.
    if (!isRegistered) return false;
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

      // Same reasoning as the relation path below: cancel, then write what was sent.
      await queryClient.cancelQueries({ queryKey: interestedKey, exact: true });
      queryClient.setQueryData<InterestedTopicRow[]>(interestedKey, current => {
        const kept = current ?? interested;
        const known = new Set(kept.map(row => normId(row.objectId)));
        return [...kept, ...added.filter(row => !known.has(normId(row.objectId)))];
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
    const gone = new Set(cleared.map(row => `${normId(row.objectId)}:${normId(row.spaceId)}`));
    queryClient.setQueryData<InterestedTopicRow[]>(interestedKey, current =>
      (current ?? interested).filter(row => !gone.has(`${normId(row.objectId)}:${normId(row.spaceId)}`))
    );
    return true;
  };

  const { mutateAsync } = useMutation({
    mutationKey: FOLLOW_MUTATION_KEY,
    mutationFn: async (variables: FollowVariables) => {
      const { spaceId } = variables;
      if (isInterestedFollowEnabled()) {
        const interested = await queryClient.ensureQueryData(interestedTopicsQueryOptions(spaceId));
        return runInterested(variables, interested);
      }

      const queryKey = followedTopicsQueryKey(spaceId);
      const rows = await queryClient.ensureQueryData(followedTopicsQueryOptions(spaceId));

      let added: FollowedTopicRelation[] = [];
      let relations: Relation[];
      if (variables.kind === 'follow') {
        const built = buildFollowRelations({
          personalSpaceId: spaceId,
          topics: variables.topics,
          existingTopicIds: new Set(rows.map(row => row.toEntityId)),
        });
        added = built.followed;
        relations = built.relations;
      } else {
        relations = buildUnfollowRelations({ personalSpaceId: spaceId, rows, topicIds: variables.topicIds });
      }

      if (relations.length === 0) return true;

      const ok = await publishOnce(makeProposal, {
        values: [],
        relations,
        spaceId,
        name: followEditName(variables.kind === 'follow' ? 'Follow' : 'Unfollow', relations),
      });
      if (!ok) return false;

      if (variables.kind === 'unfollow') reconcileDeletedRelations(relations);

      // A refetch started before the publish would land the pre-write rows.
      // No refetch after either: the indexer trails the publish, so these rows
      // stand until the query goes stale normally.
      await queryClient.cancelQueries({ queryKey, exact: true });
      const deleted = new Set(relations.filter(r => r.isDeleted).map(r => r.id));
      // A refetch during the publish may already hold the new rows.
      queryClient.setQueryData<FollowedTopicRelation[]>(queryKey, current => {
        const kept = (current ?? rows).filter(row => !deleted.has(row.id));
        const known = new Set(kept.map(row => normId(row.id)));
        return [...kept, ...added.filter(row => !known.has(normId(row.id)))];
      });
      return true;
    },
  });

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
        return await mutateAsync(
          kind === 'follow'
            ? { kind, spaceId: personalSpaceId, topicIds, topics: free }
            : { kind, spaceId: personalSpaceId, topicIds }
        );
      } catch (error) {
        console.error(`[follow-topics] ${kind} failed:`, error);
        return false;
      }
    },
    [mutateAsync, personalSpaceId, queryClient]
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

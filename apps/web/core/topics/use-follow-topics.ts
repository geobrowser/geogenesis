'use client';

import { useMutation, useMutationState, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { reconcileDeletedRelations } from '~/core/bounties/reconcile-store';
import { publishOnce } from '~/core/hooks/publish-once';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { usePublish } from '~/core/hooks/use-publish';
import { followedTopicsQueryKey } from '~/core/io/subgraph/fetch-followed-topics';
import type { Relation } from '~/core/types';
import { normId } from '~/core/utils/norm-id';

import { type FollowedTopicRelation, type TopicRef, buildFollowRelations, buildUnfollowRelations } from './follow-ops';
import { followedTopicsQueryOptions } from './use-followed-topics';

const FOLLOW_MUTATION_KEY = ['follow-topics'] as const;

type FollowVariables =
  | { kind: 'follow'; spaceId: string; topicIds: string[]; topics: TopicRef[] }
  | { kind: 'unfollow'; spaceId: string; topicIds: string[] };

function editName(verb: 'Follow' | 'Unfollow', topics: readonly { name?: string | null }[]): string {
  if (topics.length === 1 && topics[0].name) return `${verb} topic: ${topics[0].name}`;
  return `${verb} ${topics.length} topic${topics.length === 1 ? '' : 's'}`;
}

/**
 * One edit per call, published to the viewer's personal space. Topics already being written by any
 * mounted control are skipped. Resolves false when signed out, blocked, or the publish failed.
 */
export function useFollowTopics() {
  const { personalSpaceId } = usePersonalSpaceId();
  const { makeProposal } = usePublish();
  const queryClient = useQueryClient();

  const pendingIdLists = useMutationState({
    filters: { mutationKey: FOLLOW_MUTATION_KEY, status: 'pending' },
    select: mutation => (mutation.state.variables as FollowVariables | undefined)?.topicIds ?? [],
  });
  const pendingIds = React.useMemo(() => new Set(pendingIdLists.flat()), [pendingIdLists]);

  const { mutateAsync } = useMutation({
    mutationKey: FOLLOW_MUTATION_KEY,
    mutationFn: async (variables: FollowVariables) => {
      const { spaceId } = variables;
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
        name:
          variables.kind === 'follow'
            ? editName(
                'Follow',
                variables.topics.filter(t => added.some(a => a.toEntityId === t.id))
              )
            : editName(
                'Unfollow',
                variables.topicIds.map(() => ({}))
              ),
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

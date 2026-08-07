'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useCallback } from 'react';

import { Effect, Either } from 'effect';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import {
  type EntityVoteDirectionFilter,
  type UserVotedEntityIdsCache,
  addRemovedVotedId,
  clearRemovedVotedId,
  removeEntityFromVotedIds,
  userEntityVotesQueryKey,
  votedEntityIdsRemovedQueryKey,
} from '~/core/hooks/use-user-voted-entity-ids';
import { geo } from '~/core/sdk/geo-client';
import { runEffectEither } from '~/core/telemetry/effect-runtime';
import type { VoteDirection, VoteObjectType } from '~/core/utils/contracts/entity-vote';
import { validateSpaceId } from '~/core/utils/utils';

export type { VoteDirection, VoteObjectType };

// The SDK's entityVotes.upvote/downvote/withdraw hardcode object type 0 in the
// vote topic, so this hook deliberately has no objectType parameter — accepting
// one would let a caller read type-N tallies while writing type-0 votes.
interface UseEntityVoteArgs {
  entityId: string;
  spaceId: string;
}

export function useEntityVote({ entityId, spaceId }: UseEntityVoteArgs) {
  const queryClient = useQueryClient();
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();

  const tx = useSmartAccountTransaction();

  const castVote = useCallback(
    async (direction: VoteDirection) => {
      if (!validateSpaceId(spaceId)) {
        throw new Error('Invalid space ID format. Cannot submit vote.');
      }

      if (!personalSpaceId || !isRegistered) {
        throw new Error('You need a registered personal space to vote');
      }

      const params = {
        authorSpaceId: personalSpaceId,
        spaceId,
        entityId,
      };

      const { to, calldata } =
        direction === 'UP'
          ? geo.entityVotes.upvote(params)
          : direction === 'DOWN'
            ? geo.entityVotes.downvote(params)
            : geo.entityVotes.withdraw(params);

      const txEffect = tx({ to, data: calldata }).pipe(
        Effect.withSpan('web.write.entity_vote'),
        Effect.annotateSpans({
          'io.operation': 'entity_vote',
          'vote.direction': direction,
          'vote.objectType': '0',
        })
      );
      const result = await runEffectEither(txEffect);

      if (Either.isLeft(result)) {
        const error = result.left;
        console.error(
          `Entity vote failed: ${error.message}`,
          { authorSpaceId: personalSpaceId, spaceId, entityId, direction },
          error
        );
        throw error;
      }

      return result.right;
    },
    [personalSpaceId, isRegistered, spaceId, entityId, tx]
  );

  const dropFromVotedList = (direction: EntityVoteDirectionFilter) => {
    queryClient.setQueryData<UserVotedEntityIdsCache>(userEntityVotesQueryKey(personalSpaceId, direction), current =>
      removeEntityFromVotedIds(current, entityId)
    );
    queryClient.setQueryData<string[]>(votedEntityIdsRemovedQueryKey(personalSpaceId, direction), (current = []) =>
      addRemovedVotedId(current, entityId)
    );
  };

  const restoreToVotedList = (direction: EntityVoteDirectionFilter) => {
    queryClient.setQueryData<string[]>(votedEntityIdsRemovedQueryKey(personalSpaceId, direction), (current = []) =>
      clearRemovedVotedId(current, entityId)
    );
    queryClient.invalidateQueries({ queryKey: userEntityVotesQueryKey(personalSpaceId, direction) });
  };

  const onSuccess = (direction: VoteDirection) => {
    queryClient.invalidateQueries({ queryKey: ['entity-vote-count', entityId, 0] });
    queryClient.invalidateQueries({ queryKey: ['user-entity-vote', personalSpaceId, entityId, spaceId, 0] });

    if (direction !== 'UP') dropFromVotedList('up');
    if (direction !== 'DOWN') dropFromVotedList('down');

    if (direction !== 'NONE') {
      restoreToVotedList(direction === 'UP' ? 'up' : 'down');
    }
  };

  const { mutate: upvote } = useMutation({
    mutationFn: () => castVote('UP'),
    onSuccess: () => onSuccess('UP'),
  });

  const { mutate: downvote } = useMutation({
    mutationFn: () => castVote('DOWN'),
    onSuccess: () => onSuccess('DOWN'),
  });

  const { mutate: unvote } = useMutation({
    mutationFn: () => castVote('NONE'),
    onSuccess: () => onSuccess('NONE'),
  });

  return {
    upvote,
    downvote,
    unvote,
    isConnected: !!personalSpaceId && isRegistered,
    personalSpaceId,
  };
}

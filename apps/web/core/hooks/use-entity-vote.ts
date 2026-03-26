'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useCallback } from 'react';

import { Effect, Either } from 'effect';
import { type Hex, encodeFunctionData } from 'viem';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { runEffectEither } from '~/core/telemetry/effect-runtime';
import {
  type VoteDirection,
  type VoteObjectType,
  encodeEntityVoteData,
  encodeEntityVoteTopic,
} from '~/core/utils/contracts/entity-vote';
import {
  EMPTY_SIGNATURE,
  PERMISSIONLESS_ACTIONS,
  SPACE_REGISTRY_ADDRESS,
  SpaceRegistryAbi,
} from '~/core/utils/contracts/space-registry';
import { validateSpaceId } from '~/core/utils/utils';

export type { VoteDirection, VoteObjectType };

interface UseEntityVoteArgs {
  entityId: string;
  spaceId: string;
  objectType?: VoteObjectType;
}

export function useEntityVote({ entityId, spaceId, objectType = 0 }: UseEntityVoteArgs) {
  const queryClient = useQueryClient();
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();

  const tx = useSmartAccountTransaction({
    address: SPACE_REGISTRY_ADDRESS,
  });

  const castVote = useCallback(
    async (direction: VoteDirection) => {
      if (!validateSpaceId(spaceId)) {
        throw new Error('Invalid space ID format. Cannot submit vote.');
      }

      if (!personalSpaceId || !isRegistered) {
        throw new Error('You need a registered personal space to vote');
      }

      const normalizedSpaceId = spaceId.replace(/-/g, '').toLowerCase();
      const normalizedPersonalSpaceId = personalSpaceId.replace(/-/g, '').toLowerCase();

      const action =
        direction === 'UP'
          ? PERMISSIONLESS_ACTIONS.UPVOTED
          : direction === 'DOWN'
            ? PERMISSIONLESS_ACTIONS.DOWNVOTED
            : PERMISSIONLESS_ACTIONS.UNVOTED;

      const topic = encodeEntityVoteTopic(entityId, objectType);
      const data = encodeEntityVoteData(personalSpaceId, spaceId);

      const fromSpaceId = `0x${normalizedPersonalSpaceId}` as Hex;
      const toSpaceId = `0x${normalizedSpaceId}` as Hex;

      const callData = encodeFunctionData({
        functionName: 'enter',
        abi: SpaceRegistryAbi,
        args: [fromSpaceId, toSpaceId, action, topic, data, EMPTY_SIGNATURE],
      });

      const txEffect = tx(callData).pipe(
        Effect.withSpan('web.write.entity_vote'),
        Effect.annotateSpans({
          'io.operation': 'entity_vote',
          'vote.direction': direction,
          'vote.objectType': String(objectType),
        })
      );
      const result = await runEffectEither(txEffect);

      if (Either.isLeft(result)) {
        const error = result.left;
        console.error(`Entity vote failed: ${error.message}`, { fromSpaceId, toSpaceId, entityId, direction }, error);
        throw error;
      }

      return result.right;
    },
    [personalSpaceId, isRegistered, spaceId, entityId, objectType, tx]
  );

  const onSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['entity-vote-count', entityId, objectType] });
    queryClient.invalidateQueries({ queryKey: ['user-entity-vote', personalSpaceId, entityId, spaceId, objectType] });
  };

  const { mutate: upvote } = useMutation({
    mutationFn: () => castVote('UP'),
    onSuccess,
  });

  const { mutate: downvote } = useMutation({
    mutationFn: () => castVote('DOWN'),
    onSuccess,
  });

  const { mutate: unvote } = useMutation({
    mutationFn: () => castVote('NONE'),
    onSuccess,
  });

  return {
    upvote,
    downvote,
    unvote,
    isConnected: !!personalSpaceId && isRegistered,
    personalSpaceId,
  };
}

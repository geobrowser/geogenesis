'use client';

import { useMutation } from '@tanstack/react-query';

import { Effect, Either } from 'effect';
import { type Hex } from 'viem';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { useSpace } from '~/core/hooks/use-space';
import { useStatusBar } from '~/core/state/status-bar-store';
import { runEffectEither } from '~/core/telemetry/effect-runtime';
import { SPACE_REGISTRY_ADDRESS } from '~/core/utils/contracts/space-registry';
import { buildDaoTopicDeclaredCalldata, buildPersonalTopicDeclaredCalldata } from '~/core/utils/contracts/space-topic';
import { validateEntityId, validateSpaceId } from '~/core/utils/utils';

interface UseSpaceTopicArgs {
  spaceId: string | null;
}

interface SetTopicParams {
  topicEntityId: string;
}

export function useSpaceTopic({ spaceId }: UseSpaceTopicArgs) {
  const { dispatch } = useStatusBar();
  const { smartAccount } = useSmartAccount();
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();
  const { space } = useSpace(spaceId ?? undefined);

  const tx = useSmartAccountTransaction({
    address: SPACE_REGISTRY_ADDRESS,
  });

  const validatePrerequisites = () => {
    if (!smartAccount) {
      const message = 'Please connect your wallet to manage this topic';
      dispatch({ type: 'ERROR', payload: message });
      throw new Error(message);
    }

    if (!personalSpaceId || !isRegistered) {
      const message = 'You need a registered personal space to manage a topic';
      dispatch({ type: 'ERROR', payload: message });
      throw new Error(message);
    }

    if (!validateSpaceId(spaceId)) {
      const message = 'Invalid space ID format. Please try again.';
      dispatch({ type: 'ERROR', payload: message });
      throw new Error(message);
    }

    if (!space?.address) {
      const message = 'Space information is still loading. Please try again.';
      dispatch({ type: 'ERROR', payload: message });
      throw new Error(message);
    }

    return { personalSpaceId, spaceId: spaceId!, spaceAddress: space.address as Hex, spaceType: space.type };
  };

  const mutation = useMutation({
    mutationFn: async ({ topicEntityId }: SetTopicParams) => {
      const prereqs = validatePrerequisites();

      if (!validateEntityId(topicEntityId)) {
        const message = 'Invalid topic ID format. Please try again.';
        dispatch({ type: 'ERROR', payload: message });
        throw new Error(message);
      }

      const writeTxEffect = Effect.gen(function* () {
        const callData =
          prereqs.spaceType === 'DAO'
            ? buildDaoTopicDeclaredCalldata({
                authorSpaceId: prereqs.personalSpaceId,
                spaceId: prereqs.spaceId,
                spaceAddress: prereqs.spaceAddress,
                topicId: topicEntityId,
              })
            : buildPersonalTopicDeclaredCalldata({
                authorSpaceId: prereqs.personalSpaceId,
                spaceId: prereqs.spaceId,
                topicId: topicEntityId,
              });

        const telemetryAttributes =
          prereqs.spaceType === 'DAO'
            ? {
                'io.operation': 'set_space_topic',
                'space.type': 'DAO',
                'governance.action': 'proposal_created',
                'governance.proposal_action': 'topic_declared',
              }
            : {
                'io.operation': 'set_space_topic',
                'space.type': 'PERSONAL',
                'governance.action': 'topic_declared',
              };

        const hash = yield* tx(callData).pipe(
          Effect.withSpan('web.write.space_topic.set'),
          Effect.annotateSpans(telemetryAttributes)
        );
        return hash;
      });

      const result = await runEffectEither(writeTxEffect);

      Either.match(result, {
        onLeft: error => {
          console.error('Failed to update space topic', { spaceId, topicEntityId }, error);
          dispatch({
            type: 'ERROR',
            payload: String(error),
            retry: () => mutation.mutate({ topicEntityId }),
          });
          throw error;
        },
        onRight: () => console.log('Successfully set space topic'),
      });
    },
  });

  // TODO: Remove topic is not yet supported by the backend.
  // const removeMutation = useMutation({
  //   mutationFn: async () => {
  //     const prereqs = validatePrerequisites();
  //
  //     const writeTxEffect = Effect.gen(function* () {
  //       const callData =
  //         prereqs.spaceType === 'DAO'
  //           ? buildDaoTopicRemovedCalldata({
  //               authorSpaceId: prereqs.personalSpaceId,
  //               spaceId: prereqs.spaceId,
  //               spaceAddress: prereqs.spaceAddress,
  //             })
  //           : buildPersonalTopicRemovedCalldata({
  //               authorSpaceId: prereqs.personalSpaceId,
  //               spaceId: prereqs.spaceId,
  //             });
  //
  //       const telemetryAttributes =
  //         prereqs.spaceType === 'DAO'
  //           ? {
  //               'io.operation': 'remove_space_topic',
  //               'space.type': 'DAO',
  //               'governance.action': 'proposal_created',
  //               'governance.proposal_action': 'topic_removed',
  //             }
  //           : {
  //               'io.operation': 'remove_space_topic',
  //               'space.type': 'PERSONAL',
  //               'governance.action': 'topic_removed',
  //             };
  //
  //       const hash = yield* tx(callData).pipe(
  //         Effect.withSpan('web.write.space_topic.remove'),
  //         Effect.annotateSpans(telemetryAttributes)
  //       );
  //       return hash;
  //     });
  //
  //     const result = await runEffectEither(writeTxEffect);
  //
  //     Either.match(result, {
  //       onLeft: error => {
  //         console.error('Failed to remove space topic', { spaceId }, error);
  //         dispatch({
  //           type: 'ERROR',
  //           payload: String(error),
  //           retry: () => removeMutation.mutate(),
  //         });
  //         throw error;
  //       },
  //       onRight: () => console.log('Successfully removed space topic'),
  //     });
  //   },
  // });

  return {
    setTopic: mutation.mutate,
    setTopicAsync: mutation.mutateAsync,
    status: mutation.status,
  };
}

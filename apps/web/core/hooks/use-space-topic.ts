'use client';

import { IdUtils } from '@geoprotocol/geo-sdk';
import { useMutation } from '@tanstack/react-query';

import { Effect, Either } from 'effect';
import { type Hex, encodeFunctionData } from 'viem';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { useSpace } from '~/core/hooks/use-space';
import { uuidToHex } from '~/core/id/normalize';
import { useStatusBar } from '~/core/state/status-bar-store';
import { runEffectEither } from '~/core/telemetry/effect-runtime';
import { encodeProposalCreatedData, padBytes16ToBytes32 } from '~/core/utils/contracts/governance';
import {
  DAOSpaceAbi,
  EMPTY_SIGNATURE,
  EMPTY_TOPIC_HEX,
  GOVERNANCE_ACTIONS,
  SPACE_REGISTRY_ADDRESS,
  SpaceRegistryAbi,
  VOTING_MODE,
} from '~/core/utils/contracts/space-registry';
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

  const mutation = useMutation({
    mutationFn: async ({ topicEntityId }: SetTopicParams) => {
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

      if (!validateEntityId(topicEntityId)) {
        const message = 'Invalid topic ID format. Please try again.';
        dispatch({ type: 'ERROR', payload: message });
        throw new Error(message);
      }

      const topic = padBytes16ToBytes32(uuidToHex(topicEntityId));
      const actionData: Hex = '0x';

      const writeTxEffect = Effect.gen(function* () {
        const callData =
          space.type === 'DAO'
            ? buildDaoTopicCalldata({
                personalSpaceId,
                spaceId: spaceId!,
                spaceAddress: space.address as Hex,
                topic,
                actionData,
              })
            : buildPersonalTopicCalldata({
                personalSpaceId,
                spaceId: spaceId!,
                topic,
                actionData,
              });

        const telemetryAttributes =
          space.type === 'DAO'
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

  return {
    setTopic: mutation.mutate,
    setTopicAsync: mutation.mutateAsync,
    status: mutation.status,
  };
}

function buildDaoTopicCalldata({
  personalSpaceId,
  spaceId,
  spaceAddress,
  topic,
  actionData,
}: {
  personalSpaceId: string;
  spaceId: string;
  spaceAddress: Hex;
  topic: Hex;
  actionData: Hex;
}): Hex {
  const proposalId = `0x${IdUtils.generate()}` as const;
  const fromSpaceId = `0x${personalSpaceId}` as const;
  const toSpaceId = `0x${spaceId}` as const;

  const pingCallData = encodeFunctionData({
    functionName: 'ping',
    abi: DAOSpaceAbi,
    args: [GOVERNANCE_ACTIONS.TOPIC_DECLARED, topic, actionData],
  });

  const proposalActions = [
    {
      to: spaceAddress,
      value: 0n,
      data: pingCallData,
    },
  ];

  const data = encodeProposalCreatedData(proposalId, VOTING_MODE.SLOW, proposalActions);

  return encodeFunctionData({
    functionName: 'enter',
    abi: SpaceRegistryAbi,
    args: [fromSpaceId, toSpaceId, GOVERNANCE_ACTIONS.PROPOSAL_CREATED, EMPTY_TOPIC_HEX, data, EMPTY_SIGNATURE],
  });
}

function buildPersonalTopicCalldata({
  personalSpaceId,
  spaceId,
  topic,
  actionData,
}: {
  personalSpaceId: string;
  spaceId: string;
  topic: Hex;
  actionData: Hex;
}): Hex {
  const fromSpaceId = `0x${personalSpaceId}` as const;
  const toSpaceId = `0x${spaceId}` as const;

  return encodeFunctionData({
    functionName: 'enter',
    abi: SpaceRegistryAbi,
    args: [fromSpaceId, toSpaceId, GOVERNANCE_ACTIONS.TOPIC_DECLARED, topic, actionData, EMPTY_SIGNATURE],
  });
}

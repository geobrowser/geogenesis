'use client';

import { IdUtils } from '@geoprotocol/geo-sdk';
import { useMutation } from '@tanstack/react-query';
import { Effect, Either } from 'effect';
import { type Hex, encodeFunctionData } from 'viem';

import { useCallback } from 'react';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { useSpace } from '~/core/hooks/use-space';
import { useStatusBar } from '~/core/state/status-bar-store';
import { runEffectEither } from '~/core/telemetry/effect-runtime';
import {
  type SubspaceRelationType,
  encodeProposalCreatedData,
  padBytes16ToBytes32,
} from '~/core/utils/contracts/governance';
import {
  DAOSpaceAbi,
  EMPTY_SIGNATURE,
  EMPTY_TOPIC_HEX,
  GOVERNANCE_ACTIONS,
  SPACE_REGISTRY_ADDRESS,
  SpaceRegistryAbi,
  VOTING_MODE,
} from '~/core/utils/contracts/space-registry';
import { validateSpaceId } from '~/core/utils/utils';

/**
 * Maps a subspace relation type to its corresponding governance action constants
 * for setting and unsetting the relationship.
 */
const SUBSPACE_ACTION_MAP = {
  verified: {
    set: GOVERNANCE_ACTIONS.SUBSPACE_VERIFIED,
    unset: GOVERNANCE_ACTIONS.SUBSPACE_UNVERIFIED,
  },
  related: {
    set: GOVERNANCE_ACTIONS.SUBSPACE_RELATED,
    unset: GOVERNANCE_ACTIONS.SUBSPACE_UNRELATED,
  },
  subtopic: {
    set: GOVERNANCE_ACTIONS.SUBSPACE_TOPIC_DECLARED,
    unset: GOVERNANCE_ACTIONS.SUBSPACE_TOPIC_REMOVED,
  },
} as const;

type SubspaceDirection = 'set' | 'unset';

interface UseSubspaceArgs {
  /** The parent space ID (bytes16 hex without 0x prefix) */
  spaceId: string | null;
}

interface SubspaceParams {
  /** The subspace's space ID (bytes16 hex without 0x prefix) */
  subspaceId: string;
  /** The type of relationship to set or remove */
  relationType: SubspaceRelationType;
  /**
   * For 'subtopic' relation type when setting: the entity ID (UUID) in the knowledge
   * graph that represents the topic. Encoded as bytes in the data field.
   * Not used for 'verified' or 'related' types, or when unsetting.
   */
  topicEntityId?: string;
}

/**
 * Hook to manage subspace relationships (verified, related, or subtopic) on a space.
 *
 * Returns separate `setSubspace` and `unsetSubspace` mutations, each with independent
 * status tracking.
 *
 * For DAO spaces: Creates a proposal whose action calls DAOSpace.ping() with the
 * appropriate subspace action. The ping function re-enters SpaceRegistry.enter()
 * to emit the action event.
 *
 * For personal spaces: Directly calls SpaceRegistry.enter() with the subspace action
 * since personal spaces don't require governance proposals.
 */
export function useSubspace({ spaceId }: UseSubspaceArgs) {
  const { dispatch } = useStatusBar();
  const { smartAccount } = useSmartAccount();
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();
  const { space } = useSpace(spaceId ?? undefined);

  const tx = useSmartAccountTransaction({
    address: SPACE_REGISTRY_ADDRESS,
  });

  const handleSubspace = useCallback(
    (direction: SubspaceDirection) =>
      async ({ subspaceId, relationType, topicEntityId }: SubspaceParams) => {
        if (!smartAccount) {
          const message = 'Please connect your wallet to manage subspaces';
          console.error('No smart account available');
          dispatch({ type: 'ERROR', payload: message });
          throw new Error(message);
        }

        if (!personalSpaceId || !isRegistered) {
          const message = 'You need a registered personal space to manage subspaces';
          console.error('User does not have a registered personal space ID');
          dispatch({ type: 'ERROR', payload: message });
          throw new Error(message);
        }

        if (!validateSpaceId(spaceId)) {
          const message = 'Invalid space ID format. Please try again.';
          console.error('Invalid target space ID:', spaceId);
          dispatch({ type: 'ERROR', payload: message });
          throw new Error(message);
        }

        if (!space?.address) {
          const message = 'Space information is still loading. Please try again.';
          console.error('No space address found');
          dispatch({ type: 'ERROR', payload: message });
          throw new Error(message);
        }

        if (!validateSpaceId(subspaceId)) {
          const message = 'Invalid subspace ID format. Please try again.';
          console.error('Invalid subspace ID:', subspaceId);
          dispatch({ type: 'ERROR', payload: message });
          throw new Error(message);
        }

        if (direction === 'set' && relationType === 'subtopic' && !topicEntityId) {
          const message = 'A topic entity ID is required for subtopic relationships';
          console.error(message);
          dispatch({ type: 'ERROR', payload: message });
          throw new Error(message);
        }

        const action = SUBSPACE_ACTION_MAP[relationType][direction];
        const topic = padBytes16ToBytes32(subspaceId);
        const actionData = encodeTopicEntityData(direction, topicEntityId);

        console.log(`${direction === 'set' ? 'Setting' : 'Unsetting'} subspace relationship`, {
          fromSpaceId: personalSpaceId,
          toSpaceId: spaceId,
          subspaceId,
          relationType,
          action,
        });

        const writeTxEffect = Effect.gen(function* () {
          let callData: Hex;

          if (space.type === 'DAO') {
            callData = buildDaoSubspaceCalldata({
              personalSpaceId,
              spaceId: spaceId!,
              spaceAddress: space.address as Hex,
              action,
              topic,
              actionData,
            });
          } else {
            callData = buildPersonalSubspaceCalldata({
              personalSpaceId,
              spaceId: spaceId!,
              action,
              topic,
              actionData,
            });
          }

          const telemetryAttributes =
            space.type === 'DAO'
              ? {
                  'io.operation': direction === 'set' ? 'set_subspace' : 'unset_subspace',
                  'space.type': 'DAO',
                  'governance.action': 'proposal_created',
                  'governance.proposal_action': direction === 'set' ? 'subspace_set' : 'subspace_unset',
                  'governance.subspace_relation_type': relationType,
                }
              : {
                  'io.operation': direction === 'set' ? 'set_subspace' : 'unset_subspace',
                  'space.type': 'PERSONAL',
                  'governance.action': direction === 'set' ? 'subspace_set' : 'subspace_unset',
                  'governance.subspace_relation_type': relationType,
                };

          const hash = yield* tx(callData).pipe(
            Effect.withSpan(`web.write.subspace.${direction}`),
            Effect.annotateSpans(telemetryAttributes)
          );
          console.log('Transaction hash: ', hash);
          return hash;
        });

        const result = await runEffectEither(writeTxEffect);

        Either.match(result, {
          onLeft: error => {
            console.error(
              'Failed to update subspace relationship',
              { spaceId, subspaceId, relationType, direction },
              error
            );
            dispatch({
              type: 'ERROR',
              payload: String(error),
              retry: () => handleSubspace(direction)({ subspaceId, relationType, topicEntityId }),
            });
            throw error;
          },
          onRight: () =>
            console.log(
              direction === 'set'
                ? `Successfully set subspace as ${relationType}`
                : `Successfully removed ${relationType} from subspace`
            ),
        });
      },
    [dispatch, smartAccount, personalSpaceId, isRegistered, spaceId, space, tx]
  );

  const setMutation = useMutation({ mutationFn: handleSubspace('set') });
  const unsetMutation = useMutation({ mutationFn: handleSubspace('unset') });

  return {
    setSubspace: setMutation.mutate,
    setStatus: setMutation.status,
    unsetSubspace: unsetMutation.mutate,
    unsetStatus: unsetMutation.status,
  };
}

/**
 * Encodes the topic entity ID as hex data for the contract call.
 * Only relevant when setting a subtopic relationship.
 */
function encodeTopicEntityData(direction: SubspaceDirection, topicEntityId?: string): Hex {
  if (direction !== 'set' || !topicEntityId) {
    return '0x' as Hex;
  }

  const strippedId = topicEntityId.replace(/-/g, '');

  if (strippedId.length !== 32 || !/^[0-9a-fA-F]+$/.test(strippedId)) {
    throw new Error(`Invalid topic entity ID: expected UUID format, got ${topicEntityId}`);
  }

  return `0x${strippedId}` as Hex;
}

/**
 * Builds calldata for a DAO space subspace action.
 *
 * Creates a proposal via SpaceRegistry.enter() with PROPOSAL_CREATED action.
 * The proposal's execution action calls DAOSpace.ping() which re-enters the
 * registry to emit the subspace action event.
 */
function buildDaoSubspaceCalldata({
  personalSpaceId,
  spaceId,
  spaceAddress,
  action,
  topic,
  actionData,
}: {
  personalSpaceId: string;
  spaceId: string;
  spaceAddress: Hex;
  action: Hex;
  topic: Hex;
  actionData: Hex;
}): Hex {
  const proposalId = `0x${IdUtils.generate()}` as const;
  const fromSpaceId = `0x${personalSpaceId}` as const;
  const toSpaceId = `0x${spaceId}` as const;

  // Encode the ping call that will execute if the proposal passes.
  // DAOSpace.ping(action, topic, data) re-enters SpaceRegistry to emit the event.
  const pingCallData = encodeFunctionData({
    functionName: 'ping',
    abi: DAOSpaceAbi,
    args: [action, topic, actionData],
  });

  const proposalActions = [
    {
      to: spaceAddress,
      value: 0n,
      data: pingCallData,
    },
  ];

  // Subspace actions go through slow path proposals
  const data = encodeProposalCreatedData(proposalId, VOTING_MODE.SLOW, proposalActions);

  return encodeFunctionData({
    functionName: 'enter',
    abi: SpaceRegistryAbi,
    args: [fromSpaceId, toSpaceId, GOVERNANCE_ACTIONS.PROPOSAL_CREATED, EMPTY_TOPIC_HEX, data, EMPTY_SIGNATURE],
  });
}

/**
 * Builds calldata for a personal space subspace action.
 *
 * For personal spaces, we call SpaceRegistry.enter() directly with the subspace
 * action since personal spaces don't require governance proposals.
 */
function buildPersonalSubspaceCalldata({
  personalSpaceId,
  spaceId,
  action,
  topic,
  actionData,
}: {
  personalSpaceId: string;
  spaceId: string;
  action: Hex;
  topic: Hex;
  actionData: Hex;
}): Hex {
  const fromSpaceId = `0x${personalSpaceId}` as const;
  const toSpaceId = `0x${spaceId}` as const;

  return encodeFunctionData({
    functionName: 'enter',
    abi: SpaceRegistryAbi,
    args: [fromSpaceId, toSpaceId, action, topic, actionData, EMPTY_SIGNATURE],
  });
}

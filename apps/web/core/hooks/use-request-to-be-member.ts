'use client';

import { useMutation } from '@tanstack/react-query';
import { Effect, Either } from 'effect';
import { encodeFunctionData } from 'viem';

import { useCallback } from 'react';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { useStatusBar } from '~/core/state/status-bar-store';
import {
  encodeMembershipRequestData,
  generateProposalId,
  spaceIdToBytes16,
} from '~/core/utils/contracts/governance';
import {
  EMPTY_TOPIC_HEX,
  GOVERNANCE_ACTIONS,
  SPACE_REGISTRY_ADDRESS,
  SpaceRegistryAbi,
} from '~/core/utils/contracts/space-registry';

interface UseRequestToBeMemberArgs {
  /** The space ID (bytes16 hex without 0x, e.g., UUID format) of the space to join */
  spaceId: string | null;
}

export function useRequestToBeMember({ spaceId }: UseRequestToBeMemberArgs) {
  const { dispatch } = useStatusBar();

  const { smartAccount } = useSmartAccount();
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();

  const tx = useSmartAccountTransaction({
    address: SPACE_REGISTRY_ADDRESS,
  });

  const handleRequestToBeMember = useCallback(async () => {
    if (!smartAccount) {
      console.error('No smart account available');
      return null;
    }

    if (!personalSpaceId || !isRegistered) {
      console.error('User does not have a registered personal space ID');
      dispatch({
        type: 'ERROR',
        payload: 'You need a registered personal space ID to request membership',
      });
      return null;
    }

    if (!spaceId) {
      console.error('No target space ID provided');
      return null;
    }

    console.log('Requesting to be member', {
      fromSpaceId: personalSpaceId,
      toSpaceId: spaceId,
    });

    const writeTxEffect = Effect.gen(function* () {
      // Generate a unique proposal ID
      const proposalId = generateProposalId();

      // Convert space IDs to bytes16 hex format
      const fromSpaceIdHex = spaceIdToBytes16(personalSpaceId);
      const toSpaceIdHex = spaceIdToBytes16(spaceId);

      // Encode the data payload: (proposalId, newMemberSpaceId)
      const data = encodeMembershipRequestData(proposalId, fromSpaceIdHex);

      // Build the enter() call to SpaceRegistry
      const callData = encodeFunctionData({
        functionName: 'enter',
        abi: SpaceRegistryAbi,
        args: [
          fromSpaceIdHex, // _fromSpaceId: requestor's personal space ID
          toSpaceIdHex, // _toSpaceId: target space to join
          GOVERNANCE_ACTIONS.MEMBERSHIP_REQUESTED, // _action
          EMPTY_TOPIC_HEX, // _topic (not used for membership requests)
          data, // _data: encoded (proposalId, newMemberSpaceId)
          '0x', // _signature (empty for now, smart accounts don't need it)
        ],
      });

      const hash = yield* tx(callData);
      console.log('Transaction hash: ', hash);
      return hash;
    });

    const result = await Effect.runPromise(Effect.either(writeTxEffect));

    Either.match(result, {
      onLeft: error => {
        console.error(error);
        dispatch({ type: 'ERROR', payload: `${error}`, retry: handleRequestToBeMember });
        // Necessary to propagate error status to useMutation
        throw error;
      },
      onRight: () => console.log('Successfully requested to be member'),
    });
  }, [dispatch, smartAccount, personalSpaceId, isRegistered, spaceId, tx]);

  const { mutate, status } = useMutation({
    mutationFn: handleRequestToBeMember,
  });

  return {
    requestToBeMember: mutate,
    status,
  };
}

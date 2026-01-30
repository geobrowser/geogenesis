'use client';

import { useMutation } from '@tanstack/react-query';
import { Effect, Either } from 'effect';
import { type Hex, encodeFunctionData } from 'viem';

import { useCallback } from 'react';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { useSpace } from '~/core/hooks/use-space';
import { useStatusBar } from '~/core/state/status-bar-store';
import { IdUtils } from '@geoprotocol/geo-sdk';

import { encodeProposalCreatedData } from '~/core/utils/contracts/governance';
import {
  DAOSpaceAbi,
  EMPTY_SIGNATURE,
  EMPTY_TOPIC_HEX,
  GOVERNANCE_ACTIONS,
  SPACE_REGISTRY_ADDRESS,
  SpaceRegistryAbi,
  VOTING_MODE,
} from '~/core/utils/contracts/space-registry';

interface UseRequestToBeEditorArgs {
  /** The space ID (bytes16 hex without 0x, e.g., UUID format) of the space to become an editor of */
  spaceId: string | null;
}

export function useRequestToBeEditor({ spaceId }: UseRequestToBeEditorArgs) {
  const { dispatch } = useStatusBar();

  const { smartAccount } = useSmartAccount();
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();
  const { space } = useSpace(spaceId ?? undefined);

  const tx = useSmartAccountTransaction({
    address: SPACE_REGISTRY_ADDRESS,
  });

  const handleRequestToBeEditor = useCallback(async () => {
    if (!smartAccount) {
      console.error('No smart account available');
      return null;
    }

    if (!personalSpaceId || !isRegistered) {
      console.error('User does not have a registered personal space ID');
      dispatch({
        type: 'ERROR',
        payload: 'You need a registered personal space ID to request editorship',
      });
      return null;
    }

    if (!spaceId) {
      console.error('No target space ID provided');
      return null;
    }

    if (!space?.daoAddress) {
      console.error('No DAOSpace address found for space');
      return null;
    }

    const daoSpaceAddress = space.daoAddress as Hex;

    console.log('Requesting to be editor', {
      fromSpaceId: personalSpaceId,
      toSpaceId: spaceId,
      daoSpaceAddress,
    });

    const writeTxEffect = Effect.gen(function* () {
      const proposalId = `0x${IdUtils.generate()}` as const;
      const fromSpaceId = `0x${personalSpaceId}` as const;
      const toSpaceId = `0x${spaceId}` as const;

      // Encode the addEditor call that will execute if the proposal passes
      const addEditorCallData = encodeFunctionData({
        functionName: 'addEditor',
        abi: DAOSpaceAbi,
        args: [fromSpaceId],
      });

      const proposalActions = [
        {
          to: daoSpaceAddress,
          value: 0n,
          data: addEditorCallData,
        },
      ];

      const data = encodeProposalCreatedData(proposalId, VOTING_MODE.SLOW, proposalActions);

      const callData = encodeFunctionData({
        functionName: 'enter',
        abi: SpaceRegistryAbi,
        args: [
          fromSpaceId,
          toSpaceId,
          GOVERNANCE_ACTIONS.PROPOSAL_CREATED,
          EMPTY_TOPIC_HEX,
          data,
          EMPTY_SIGNATURE,
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
        dispatch({ type: 'ERROR', payload: `${error}`, retry: handleRequestToBeEditor });
        // Necessary to propagate error status to useMutation
        throw error;
      },
      onRight: () => console.log('Successfully requested to be editor'),
    });
  }, [dispatch, smartAccount, personalSpaceId, isRegistered, spaceId, space, tx]);

  const { mutate, status } = useMutation({
    mutationFn: handleRequestToBeEditor,
  });

  return {
    requestToBeEditor: mutate,
    status,
  };
}

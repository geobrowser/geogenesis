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

interface UseProposeAddEditorArgs {
  /** The DAO space ID (bytes16 hex without 0x prefix) to propose adding an editor to */
  spaceId: string | null;
}

interface ProposeAddEditorParams {
  /** The space ID (bytes16 hex without 0x prefix) of the editor to add */
  targetEditorSpaceId: string;
}

/**
 * Hook to propose adding an editor to a DAO space.
 *
 * Note: Editor actions are NOT valid for fast path per the DAOSpace contract.
 * This hook always uses slow path (VOTING_MODE.SLOW).
 */
export function useProposeAddEditor({ spaceId }: UseProposeAddEditorArgs) {
  const { dispatch } = useStatusBar();

  const { smartAccount } = useSmartAccount();
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();
  const { space } = useSpace(spaceId ?? undefined);

  const tx = useSmartAccountTransaction({
    address: SPACE_REGISTRY_ADDRESS,
  });

  const handleProposeAddEditor = useCallback(
    async ({ targetEditorSpaceId }: ProposeAddEditorParams) => {
      if (!smartAccount) {
        const message = 'Please connect your wallet to propose adding an editor';
        console.error('No smart account available');
        dispatch({ type: 'ERROR', payload: message });
        throw new Error(message);
      }

      if (!personalSpaceId || !isRegistered) {
        const message = 'You need a registered personal space to propose adding an editor';
        console.error('User does not have a registered personal space ID');
        dispatch({ type: 'ERROR', payload: message });
        throw new Error(message);
      }

      if (!spaceId) {
        const message = 'Unable to identify the space. Please try again.';
        console.error('No target space ID provided');
        dispatch({ type: 'ERROR', payload: message });
        throw new Error(message);
      }

      if (!space?.address) {
        const message = 'Space information is still loading. Please try again.';
        console.error('No space address found');
        dispatch({ type: 'ERROR', payload: message });
        throw new Error(message);
      }

      if (!targetEditorSpaceId) {
        const message = 'Unable to identify the editor to add. Please try again.';
        console.error('No target editor space ID provided');
        dispatch({ type: 'ERROR', payload: message });
        throw new Error(message);
      }

      const spaceAddress = space.address as Hex;

      console.log('Proposing to add editor', {
        fromSpaceId: personalSpaceId,
        toSpaceId: spaceId,
        targetEditorSpaceId,
        spaceAddress,
      });

      const writeTxEffect = Effect.gen(function* () {
        const proposalId = `0x${IdUtils.generate()}` as const;
        const fromSpaceId = `0x${personalSpaceId}` as const;
        const toSpaceId = `0x${spaceId}` as const;
        const editorSpaceId = `0x${targetEditorSpaceId}` as const;

        // Encode the addEditor call that will execute if the proposal passes
        const addEditorCallData = encodeFunctionData({
          functionName: 'addEditor',
          abi: DAOSpaceAbi,
          args: [editorSpaceId],
        });

        const proposalActions = [
          {
            to: spaceAddress,
            value: 0n,
            data: addEditorCallData,
          },
        ];

        // Editor actions must use slow path - not valid for fast path per contract
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
          dispatch({
            type: 'ERROR',
            payload: String(error),
            retry: () => handleProposeAddEditor({ targetEditorSpaceId }),
          });
          // Necessary to propagate error status to useMutation
          throw error;
        },
        onRight: () => console.log('Successfully proposed to add editor'),
      });
    },
    [dispatch, smartAccount, personalSpaceId, isRegistered, spaceId, space, tx]
  );

  const { mutate, status } = useMutation({
    mutationFn: handleProposeAddEditor,
  });

  return {
    proposeAddEditor: mutate,
    status,
  };
}

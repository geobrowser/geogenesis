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
import { validateSpaceId } from '~/core/utils/utils';

interface UseProposeRemoveEditorArgs {
  /** The DAO space ID (bytes16 hex without 0x prefix) to propose removing an editor from */
  spaceId: string | null;
}

interface ProposeRemoveEditorParams {
  /** The space ID (bytes16 hex without 0x prefix) of the editor to remove */
  targetEditorSpaceId: string;
}

/**
 * Hook to propose removing an editor from a DAO space.
 *
 * Note: Editor actions are NOT valid for fast path per the DAOSpace contract.
 * This hook always uses slow path (VOTING_MODE.SLOW).
 */
export function useProposeRemoveEditor({ spaceId }: UseProposeRemoveEditorArgs) {
  const { dispatch } = useStatusBar();

  const { smartAccount } = useSmartAccount();
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();
  const { space } = useSpace(spaceId ?? undefined);

  const tx = useSmartAccountTransaction({
    address: SPACE_REGISTRY_ADDRESS,
  });

  const handleProposeRemoveEditor = useCallback(
    async ({ targetEditorSpaceId }: ProposeRemoveEditorParams) => {
      if (!smartAccount) {
        const message = 'Please connect your wallet to propose removing an editor';
        console.error('No smart account available');
        dispatch({ type: 'ERROR', payload: message });
        throw new Error(message);
      }

      if (!personalSpaceId || !isRegistered) {
        const message = 'You need a registered personal space to propose removing an editor';
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

      if (!validateSpaceId(targetEditorSpaceId)) {
        const message = 'Invalid editor ID format. Please try again.';
        console.error('Invalid target editor space ID:', targetEditorSpaceId);
        dispatch({ type: 'ERROR', payload: message });
        throw new Error(message);
      }

      const spaceAddress = space.address as Hex;

      const writeTxEffect = Effect.gen(function* () {
        const proposalId = `0x${IdUtils.generate()}` as const;
        const fromSpaceId = `0x${personalSpaceId}` as const;
        const toSpaceId = `0x${spaceId}` as const;
        const editorSpaceId = `0x${targetEditorSpaceId}` as const;

        // Encode the removeEditor call that will execute if the proposal passes
        const removeEditorCallData = encodeFunctionData({
          functionName: 'removeEditor',
          abi: DAOSpaceAbi,
          args: [editorSpaceId],
        });

        const proposalActions = [
          {
            to: spaceAddress,
            value: 0n,
            data: removeEditorCallData,
          },
        ];

        // Editor actions must use slow path - not valid for fast path per contract
        const data = encodeProposalCreatedData(proposalId, VOTING_MODE.SLOW, proposalActions);

        const callData = encodeFunctionData({
          functionName: 'enter',
          abi: SpaceRegistryAbi,
          args: [fromSpaceId, toSpaceId, GOVERNANCE_ACTIONS.PROPOSAL_CREATED, EMPTY_TOPIC_HEX, data, EMPTY_SIGNATURE],
        });

        const hash = yield* tx(callData);
        return hash;
      });

      const result = await Effect.runPromise(Effect.either(writeTxEffect));

      Either.match(result, {
        onLeft: error => {
          console.error(error);
          dispatch({
            type: 'ERROR',
            payload: String(error),
            retry: () => handleProposeRemoveEditor({ targetEditorSpaceId }),
          });
          // Necessary to propagate error status to useMutation
          throw error;
        },
        onRight: () => {},
      });
    },
    [dispatch, smartAccount, personalSpaceId, isRegistered, spaceId, space, tx]
  );

  const { mutate, status } = useMutation({
    mutationFn: handleProposeRemoveEditor,
  });

  return {
    proposeRemoveEditor: mutate,
    status,
  };
}

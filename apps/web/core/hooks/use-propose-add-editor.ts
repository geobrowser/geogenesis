'use client';

import { useMutation } from '@tanstack/react-query';

import { useCallback } from 'react';

import { Effect, Either } from 'effect';
import { type Hex } from 'viem';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { useSpace } from '~/core/hooks/use-space';
import { geo } from '~/core/sdk/geo-client';
import { useStatusBar } from '~/core/state/status-bar-store';
import { runEffectEither } from '~/core/telemetry/effect-runtime';
import { SPACE_REGISTRY_ADDRESS } from '~/core/utils/contracts/space-registry';
import { validateSpaceId } from '~/core/utils/utils';

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
 * This hook always uses slow path.
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

      if (!validateSpaceId(spaceId)) {
        const message = 'Invalid space ID format. Please try again.';
        console.error('Invalid target space ID:', spaceId);
        dispatch({ type: 'ERROR', payload: message });
        throw new Error(message);
      }

      if (!validateSpaceId(targetEditorSpaceId)) {
        const message = 'Invalid editor ID format. Please try again.';
        console.error('Invalid target editor space ID:', targetEditorSpaceId);
        dispatch({ type: 'ERROR', payload: message });
        throw new Error(message);
      }

      // The proposal's addEditor action must call the DAO space contract directly.
      if (!space?.address) {
        const message = 'No space address found. Please try again.';
        console.error('No space address found for space:', spaceId);
        dispatch({ type: 'ERROR', payload: message });
        throw new Error(message);
      }

      console.log('Proposing to add editor', {
        authorSpaceId: personalSpaceId,
        spaceId,
        targetEditorSpaceId,
      });

      const { calldata: callData } = geo.daoSpaces.proposeAddEditor({
        authorSpaceId: personalSpaceId,
        spaceId,
        daoSpaceAddress: space.address as Hex,
        newEditorSpaceId: targetEditorSpaceId,
        votingMode: 'SLOW',
      });

      const writeTxEffect = tx(callData).pipe(
        Effect.withSpan('web.write.createProposal.addEditor'),
        Effect.annotateSpans({
          'io.operation': 'create_proposal',
          'space.type': 'DAO',
          'governance.action': 'proposal_created',
          'governance.proposal_action': 'add_editor',
          'governance.voting_mode': 'SLOW',
        })
      );

      const result = await runEffectEither(writeTxEffect);

      Either.match(result, {
        onLeft: error => {
          console.error('Failed to propose add editor', { spaceId, targetEditorSpaceId, personalSpaceId }, error);
          dispatch({
            type: 'ERROR',
            payload: String(error),
            retry: () => handleProposeAddEditor({ targetEditorSpaceId }),
          });
          // Necessary to propagate error status to useMutation
          throw error;
        },
        onRight: hash => console.log('Successfully proposed to add editor. Transaction hash:', hash),
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

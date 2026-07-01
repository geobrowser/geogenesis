'use client';

import { useMutation } from '@tanstack/react-query';

import { useCallback } from 'react';

import { Effect, Either } from 'effect';
import type { Hex } from 'viem';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { useSpace } from '~/core/hooks/use-space';
import { geo } from '~/core/sdk/geo-client';
import { useStatusBar } from '~/core/state/status-bar-store';
import { runEffectEither } from '~/core/telemetry/effect-runtime';
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
 * This hook always uses slow path.
 */
export function useProposeRemoveEditor({ spaceId }: UseProposeRemoveEditorArgs) {
  const { dispatch } = useStatusBar();

  const { smartAccount } = useSmartAccount();
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();
  const { space } = useSpace(spaceId ?? undefined);

  const tx = useSmartAccountTransaction();

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

      if (!validateSpaceId(targetEditorSpaceId)) {
        const message = 'Invalid editor ID format. Please try again.';
        console.error('Invalid target editor space ID:', targetEditorSpaceId);
        dispatch({ type: 'ERROR', payload: message });
        throw new Error(message);
      }

      // The proposal's removeEditor action must call the DAO space contract directly.
      if (!space?.address) {
        const message = 'No space address found. Please try again.';
        console.error('No space address found for space:', spaceId);
        dispatch({ type: 'ERROR', payload: message });
        throw new Error(message);
      }

      console.log('Proposing to remove editor', {
        authorSpaceId: personalSpaceId,
        spaceId,
        targetEditorSpaceId,
      });

      const { to, calldata } = geo.daoSpaces.proposeRemoveEditor({
        authorSpaceId: personalSpaceId,
        spaceId,
        daoSpaceAddress: space.address as Hex,
        editorToRemoveSpaceId: targetEditorSpaceId,
      });

      const writeTxEffect = tx({ to, data: calldata }).pipe(
        Effect.withSpan('web.write.createProposal.removeEditor'),
        Effect.annotateSpans({
          'io.operation': 'create_proposal',
          'space.type': 'DAO',
          'governance.action': 'proposal_created',
          'governance.proposal_action': 'remove_editor',
          'governance.voting_mode': 'SLOW',
        })
      );

      const result = await runEffectEither(writeTxEffect);

      Either.match(result, {
        onLeft: error => {
          console.error('Failed to propose remove editor', { spaceId, targetEditorSpaceId, personalSpaceId }, error);
          dispatch({
            type: 'ERROR',
            payload: String(error),
            retry: () => handleProposeRemoveEditor({ targetEditorSpaceId }),
          });
          // Necessary to propagate error status to useMutation
          throw error;
        },
        onRight: hash => console.log('Successfully proposed to remove editor. Transaction hash:', hash),
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

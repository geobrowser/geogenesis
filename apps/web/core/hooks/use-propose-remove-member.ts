'use client';

import { daoSpace } from '@geoprotocol/geo-sdk';
import { useMutation } from '@tanstack/react-query';

import { useCallback } from 'react';

import { Effect, Either } from 'effect';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { useStatusBar } from '~/core/state/status-bar-store';
import { runEffectEither } from '~/core/telemetry/effect-runtime';
import { SPACE_REGISTRY_ADDRESS } from '~/core/utils/contracts/space-registry';
import { validateSpaceId } from '~/core/utils/utils';

interface UseProposeRemoveMemberArgs {
  /** The DAO space ID (bytes16 hex without 0x prefix) to propose removing a member from */
  spaceId: string | null;
}

interface ProposeRemoveMemberParams {
  /** The space ID (bytes16 hex without 0x prefix) of the member to remove */
  targetMemberSpaceId: string;
  /** Voting mode: 'fast' (threshold-based) or 'slow' (duration-based). Defaults to 'fast' since removeMember is fast-path-valid. */
  votingMode?: 'fast' | 'slow';
}

export function useProposeRemoveMember({ spaceId }: UseProposeRemoveMemberArgs) {
  const { dispatch } = useStatusBar();

  const { smartAccount } = useSmartAccount();
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();

  const tx = useSmartAccountTransaction({
    address: SPACE_REGISTRY_ADDRESS,
  });

  const handleProposeRemoveMember = useCallback(
    async ({ targetMemberSpaceId, votingMode = 'fast' }: ProposeRemoveMemberParams) => {
      if (!smartAccount) {
        const message = 'Please connect your wallet to propose removing a member';
        console.error('No smart account available');
        dispatch({ type: 'ERROR', payload: message });
        throw new Error(message);
      }

      if (!personalSpaceId || !isRegistered) {
        const message = 'You need a registered personal space to propose removing a member';
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

      if (!validateSpaceId(targetMemberSpaceId)) {
        const message = 'Invalid member ID format. Please try again.';
        console.error('Invalid target member space ID:', targetMemberSpaceId);
        dispatch({ type: 'ERROR', payload: message });
        throw new Error(message);
      }

      const normalizedVotingMode = votingMode === 'slow' ? 'SLOW' : 'FAST';

      console.log('Proposing to remove member', {
        authorSpaceId: personalSpaceId,
        spaceId,
        targetMemberSpaceId,
        votingMode: normalizedVotingMode,
      });

      const { calldata: callData } = daoSpace.proposeRemoveMember({
        authorSpaceId: personalSpaceId,
        spaceId,
        memberToRemoveSpaceId: targetMemberSpaceId,
        votingMode: normalizedVotingMode,
      });

      const writeTxEffect = tx(callData).pipe(
        Effect.withSpan('web.write.createProposal.removeMember'),
        Effect.annotateSpans({
          'io.operation': 'create_proposal',
          'space.type': 'DAO',
          'governance.action': 'proposal_created',
          'governance.proposal_action': 'remove_member',
          'governance.voting_mode': normalizedVotingMode,
        })
      );

      const result = await runEffectEither(writeTxEffect);

      Either.match(result, {
        onLeft: error => {
          console.error(
            'Failed to propose remove member',
            { spaceId, targetMemberSpaceId, votingMode, personalSpaceId },
            error
          );
          dispatch({
            type: 'ERROR',
            payload: String(error),
            retry: () => handleProposeRemoveMember({ targetMemberSpaceId, votingMode }),
          });
          // Necessary to propagate error status to useMutation
          throw error;
        },
        onRight: hash => console.log('Successfully proposed to remove member. Transaction hash:', hash),
      });
    },
    [dispatch, smartAccount, personalSpaceId, isRegistered, spaceId, tx]
  );

  const { mutate, status } = useMutation({
    mutationFn: handleProposeRemoveMember,
  });

  return {
    proposeRemoveMember: mutate,
    status,
  };
}

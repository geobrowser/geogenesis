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

interface UseProposeAddMemberArgs {
  /** The DAO space ID (bytes16 hex without 0x prefix) to propose adding a member to */
  spaceId: string | null;
}

interface ProposeAddMemberParams {
  /** The space ID (bytes16 hex without 0x prefix) of the member to add */
  targetMemberSpaceId: string;
  /** Voting mode: 'fast' (threshold-based) or 'slow' (duration-based). Defaults to 'fast' since addMember is fast-path-valid. */
  votingMode?: 'fast' | 'slow';
}

export function useProposeAddMember({ spaceId }: UseProposeAddMemberArgs) {
  const { dispatch } = useStatusBar();

  const { smartAccount } = useSmartAccount();
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();
  const { space } = useSpace(spaceId ?? undefined);

  const tx = useSmartAccountTransaction({
    address: SPACE_REGISTRY_ADDRESS,
  });

  const handleProposeAddMember = useCallback(
    async ({ targetMemberSpaceId, votingMode = 'fast' }: ProposeAddMemberParams) => {
      if (!smartAccount) {
        const message = 'Please connect your wallet to propose adding a member';
        console.error('No smart account available');
        dispatch({ type: 'ERROR', payload: message });
        throw new Error(message);
      }

      if (!personalSpaceId || !isRegistered) {
        const message = 'You need a registered personal space to propose adding a member';
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

      if (!validateSpaceId(targetMemberSpaceId)) {
        const message = 'Invalid member ID format. Please try again.';
        console.error('Invalid target member space ID:', targetMemberSpaceId);
        dispatch({ type: 'ERROR', payload: message });
        throw new Error(message);
      }

      const spaceAddress = space.address as Hex;
      const normalizedVotingMode = votingMode === 'slow' ? 'SLOW' : 'FAST';
      const votingModeValue = normalizedVotingMode === 'FAST' ? VOTING_MODE.FAST : VOTING_MODE.SLOW;

      console.log('Proposing to add member', {
        fromSpaceId: personalSpaceId,
        toSpaceId: spaceId,
        targetMemberSpaceId,
        votingMode,
        spaceAddress,
      });

      const writeTxEffect = Effect.gen(function* () {
        const proposalId = `0x${IdUtils.generate()}` as const;
        const fromSpaceId = `0x${personalSpaceId}` as const;
        const toSpaceId = `0x${spaceId}` as const;
        const memberSpaceId = `0x${targetMemberSpaceId}` as const;

        // Encode the addMember call that will execute if the proposal passes
        const addMemberCallData = encodeFunctionData({
          functionName: 'addMember',
          abi: DAOSpaceAbi,
          args: [memberSpaceId],
        });

        const proposalActions = [
          {
            to: spaceAddress,
            value: 0n,
            data: addMemberCallData,
          },
        ];

        const data = encodeProposalCreatedData(proposalId, votingModeValue, proposalActions);

        const callData = encodeFunctionData({
          functionName: 'enter',
          abi: SpaceRegistryAbi,
          args: [fromSpaceId, toSpaceId, GOVERNANCE_ACTIONS.PROPOSAL_CREATED, EMPTY_TOPIC_HEX, data, EMPTY_SIGNATURE],
        });

        const hash = yield* tx(callData).pipe(
          Effect.withSpan('web.write.createProposal.addMember'),
          Effect.annotateSpans({
            'io.operation': 'create_proposal',
            'space.type': 'DAO',
            'governance.action': 'proposal_created',
            'governance.proposal_action': 'add_member',
            'governance.voting_mode': normalizedVotingMode,
          })
        );
        console.log('Transaction hash: ', hash);
        return hash;
      });

      const result = await runEffectEither(writeTxEffect);

      Either.match(result, {
        onLeft: error => {
          console.error(
            'Failed to propose add member',
            { spaceId, targetMemberSpaceId, votingMode, personalSpaceId },
            error
          );
          dispatch({
            type: 'ERROR',
            payload: String(error),
            retry: () => handleProposeAddMember({ targetMemberSpaceId, votingMode }),
          });
          // Necessary to propagate error status to useMutation
          throw error;
        },
        onRight: () => console.log('Successfully proposed to add member'),
      });
    },
    [dispatch, smartAccount, personalSpaceId, isRegistered, spaceId, space, tx]
  );

  const { mutate, status } = useMutation({
    mutationFn: handleProposeAddMember,
  });

  return {
    proposeAddMember: mutate,
    status,
  };
}

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

interface UseProposeRemoveMemberArgs {
  /** The DAO space ID (bytes16 hex without 0x prefix) to propose removing a member from */
  spaceId: string | null;
}

interface ProposeRemoveMemberParams {
  /** The space ID (bytes16 hex without 0x prefix) of the member to remove */
  targetMemberSpaceId: string;
  /** Voting mode: 'fast' (threshold-based) or 'slow' (duration-based). Defaults to 'slow'. */
  votingMode?: 'fast' | 'slow';
}

export function useProposeRemoveMember({ spaceId }: UseProposeRemoveMemberArgs) {
  const { dispatch } = useStatusBar();

  const { smartAccount } = useSmartAccount();
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();
  const { space } = useSpace(spaceId ?? undefined);

  const tx = useSmartAccountTransaction({
    address: SPACE_REGISTRY_ADDRESS,
  });

  const handleProposeRemoveMember = useCallback(
    async ({ targetMemberSpaceId, votingMode = 'slow' }: ProposeRemoveMemberParams) => {
      if (!smartAccount) {
        console.error('No smart account available');
        return null;
      }

      if (!personalSpaceId || !isRegistered) {
        console.error('User does not have a registered personal space ID');
        dispatch({
          type: 'ERROR',
          payload: 'You need a registered personal space ID to propose removing a member',
        });
        return null;
      }

      if (!spaceId) {
        console.error('No target space ID provided');
        return null;
      }

      if (!space?.address) {
        console.error('No space address found');
        return null;
      }

      if (!targetMemberSpaceId) {
        console.error('No target member space ID provided');
        return null;
      }

      const spaceAddress = space.address as Hex;
      const votingModeValue = votingMode === 'fast' ? VOTING_MODE.FAST : VOTING_MODE.SLOW;

      console.log('Proposing to remove member', {
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

        // Encode the removeMember call that will execute if the proposal passes
        const removeMemberCallData = encodeFunctionData({
          functionName: 'removeMember',
          abi: DAOSpaceAbi,
          args: [memberSpaceId],
        });

        const proposalActions = [
          {
            to: spaceAddress,
            value: 0n,
            data: removeMemberCallData,
          },
        ];

        const data = encodeProposalCreatedData(proposalId, votingModeValue, proposalActions);

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
            payload: `${error}`,
            retry: () => handleProposeRemoveMember({ targetMemberSpaceId, votingMode }),
          });
          // Necessary to propagate error status to useMutation
          throw error;
        },
        onRight: () => console.log('Successfully proposed to remove member'),
      });
    },
    [dispatch, smartAccount, personalSpaceId, isRegistered, spaceId, space, tx]
  );

  const { mutate, status } = useMutation({
    mutationFn: handleProposeRemoveMember,
  });

  return {
    proposeRemoveMember: mutate,
    status,
  };
}

'use client';

import { useMutation } from '@tanstack/react-query';
import { Effect, Either } from 'effect';
import { type Hex, encodeFunctionData } from 'viem';

import { useCallback } from 'react';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { SubstreamVote } from '~/core/io/substream-schema';
import { VoteOption, encodeProposalVotedData, padBytes16ToBytes32 } from '~/core/utils/contracts/governance';
import {
  EMPTY_SIGNATURE,
  GOVERNANCE_ACTIONS,
  SPACE_REGISTRY_ADDRESS,
  SpaceRegistryAbi,
} from '~/core/utils/contracts/space-registry';
import { validateSpaceId } from '~/core/utils/utils';

interface UseVoteArgs {
  /** The DAO space ID (bytes16 hex without 0x prefix) where the proposal exists */
  spaceId: string;
  /** The proposal ID (bytes16 hex without 0x prefix) */
  onchainProposalId: string;
}

/**
 * Hook for voting on a proposal in the new protocol.
 *
 * Votes are cast by calling SpaceRegistry.enter() with:
 * - fromSpaceId: The voter's personal space ID
 * - toSpaceId: The DAO space ID where the proposal exists
 * - action: GOVERNANCE_ACTIONS.PROPOSAL_VOTED
 * - topic: The proposal ID (as bytes32)
 * - data: Encoded (proposalId, voteOption)
 */
export function useVote({ spaceId, onchainProposalId }: UseVoteArgs) {
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();

  const tx = useSmartAccountTransaction({
    address: SPACE_REGISTRY_ADDRESS,
  });

  const handleVote = useCallback(
    async (option: SubstreamVote['vote']) => {
      // Validate inputs
      if (!validateSpaceId(spaceId)) {
        throw new Error('Invalid space ID format. Cannot submit vote.');
      }

      if (!validateSpaceId(onchainProposalId)) {
        throw new Error('Invalid proposal ID format. Cannot submit vote.');
      }

      if (!personalSpaceId || !isRegistered) {
        throw new Error('You need a registered personal space to vote');
      }

      const fromSpaceId = `0x${personalSpaceId}` as Hex;
      const toSpaceId = `0x${spaceId}` as Hex;
      const proposalId = `0x${onchainProposalId}` as Hex;

      // Map vote option to contract enum
      const voteOption = option === 'ACCEPT' ? VoteOption.Yes : VoteOption.No;

      // Encode the vote data: (proposalId, voteOption)
      const data = encodeProposalVotedData(proposalId, voteOption);

      // The topic is the proposal ID padded to bytes32
      const topic = padBytes16ToBytes32(onchainProposalId);

      const callData = encodeFunctionData({
        functionName: 'enter',
        abi: SpaceRegistryAbi,
        args: [fromSpaceId, toSpaceId, GOVERNANCE_ACTIONS.PROPOSAL_VOTED, topic, data, EMPTY_SIGNATURE],
      });

      // Log before transaction for debugging
      console.log('Submitting vote', {
        fromSpaceId,
        toSpaceId,
        proposalId: onchainProposalId,
        voteOption: option,
        action: 'PROPOSAL_VOTED',
      });

      const txEffect = tx(callData);
      const result = await Effect.runPromise(Effect.either(txEffect));

      if (Either.isLeft(result)) {
        console.error('Vote failed', {
          error: result.left,
          fromSpaceId,
          toSpaceId,
          proposalId: onchainProposalId,
          voteOption: option,
        });
        throw result.left;
      }

      console.log('Vote successful', {
        txHash: result.right,
        fromSpaceId,
        toSpaceId,
        proposalId: onchainProposalId,
        voteOption: option,
      });

      return result.right;
    },
    [personalSpaceId, isRegistered, spaceId, onchainProposalId, tx]
  );

  const { mutate, status } = useMutation({
    mutationFn: handleVote,
  });

  return {
    vote: mutate,
    status,
  };
}

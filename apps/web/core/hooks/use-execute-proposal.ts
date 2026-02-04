'use client';

import { useMutation } from '@tanstack/react-query';
import { Effect, Either } from 'effect';
import { type Hex, encodeFunctionData } from 'viem';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { encodeProposalExecutedData } from '~/core/utils/contracts/governance';
import {
  EMPTY_SIGNATURE,
  GOVERNANCE_ACTIONS,
  SPACE_REGISTRY_ADDRESS,
  SpaceRegistryAbi,
} from '~/core/utils/contracts/space-registry';

interface UseExecuteProposalArgs {
  /** The DAO space ID (bytes16 hex without 0x prefix) where the proposal exists */
  spaceId: string;
  /** The proposal ID (bytes16 hex without 0x prefix) */
  onchainProposalId: string;
}

/**
 * Hook for executing a passed proposal in the new protocol.
 *
 * Execution is triggered by calling SpaceRegistry.enter() with:
 * - fromSpaceId: The executor's personal space ID
 * - toSpaceId: The DAO space ID where the proposal exists
 * - action: GOVERNANCE_ACTIONS.PROPOSAL_EXECUTED
 * - topic: The proposal ID (as bytes32)
 * - data: Encoded (proposalId)
 *
 * Note: Anyone can execute a proposal once it has passed the support threshold.
 */
export function useExecuteProposal({ spaceId, onchainProposalId }: UseExecuteProposalArgs) {
  const { smartAccount } = useSmartAccount();
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();

  const tx = useSmartAccountTransaction({
    address: SPACE_REGISTRY_ADDRESS,
  });

  const { mutate, status } = useMutation({
    mutationFn: async () => {
      if (!smartAccount) {
        throw new Error('Please connect your wallet to execute the proposal');
      }

      if (!personalSpaceId || !isRegistered) {
        throw new Error('You need a registered personal space to execute proposals');
      }

      const fromSpaceId = `0x${personalSpaceId}` as Hex;
      const toSpaceId = `0x${spaceId}` as Hex;
      const proposalId = `0x${onchainProposalId}` as Hex;

      // Encode the execute data: (proposalId)
      const data = encodeProposalExecutedData(proposalId);

      // The topic is the proposal ID (as bytes32)
      const topic = `0x${onchainProposalId}${'0'.repeat(32)}`.slice(0, 66) as Hex;

      const callData = encodeFunctionData({
        functionName: 'enter',
        abi: SpaceRegistryAbi,
        args: [fromSpaceId, toSpaceId, GOVERNANCE_ACTIONS.PROPOSAL_EXECUTED, topic, data, EMPTY_SIGNATURE],
      });

      const txEffect = tx(callData);
      const result = await Effect.runPromise(Effect.either(txEffect));

      if (Either.isLeft(result)) {
        console.error('Execute failed:', result.left);
        throw result.left;
      }

      console.log('Execute successful!', result.right);
      return result.right;
    },
  });

  return {
    execute: mutate,
    status,
  };
}

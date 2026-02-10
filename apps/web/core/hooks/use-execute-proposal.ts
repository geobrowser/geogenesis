'use client';

import { useMutation } from '@tanstack/react-query';
import { Effect, Either } from 'effect';
import { type Hex, encodeFunctionData } from 'viem';

import { useCallback } from 'react';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { encodeProposalExecutedData, padBytes16ToBytes32 } from '~/core/utils/contracts/governance';
import {
  EMPTY_SIGNATURE,
  GOVERNANCE_ACTIONS,
  SPACE_REGISTRY_ADDRESS,
  SpaceRegistryAbi,
} from '~/core/utils/contracts/space-registry';
import { validateSpaceId } from '~/core/utils/utils';

interface UseExecuteProposalArgs {
  /** The DAO space ID (bytes16 hex without 0x prefix) where the proposal exists */
  spaceId: string;
  /** The proposal ID (bytes16 hex without 0x prefix) */
  proposalId: string;
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
export function useExecuteProposal({ spaceId, proposalId }: UseExecuteProposalArgs) {
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();

  const tx = useSmartAccountTransaction({
    address: SPACE_REGISTRY_ADDRESS,
  });

  const handleExecute = useCallback(async () => {
    if (!validateSpaceId(spaceId)) {
      throw new Error('Invalid space ID format. Cannot execute proposal.');
    }

    if (!validateSpaceId(proposalId)) {
      throw new Error('Invalid proposal ID format. Cannot execute proposal.');
    }

    if (!personalSpaceId || !isRegistered) {
      throw new Error('You need a registered personal space to execute proposals');
    }

    const normalizedSpaceId = spaceId.replace(/-/g, '').toLowerCase();
    const normalizedProposalId = proposalId.replace(/-/g, '').toLowerCase();

    const fromSpaceId = `0x${personalSpaceId}` as Hex;
    const toSpaceId = `0x${normalizedSpaceId}` as Hex;
    const proposalIdHex = `0x${normalizedProposalId}` as Hex;

    // Encode the execute data: (proposalId)
    const data = encodeProposalExecutedData(proposalIdHex);

    // The topic is the proposal ID padded to bytes32
    const topic = padBytes16ToBytes32(normalizedProposalId);

    const callData = encodeFunctionData({
      functionName: 'enter',
      abi: SpaceRegistryAbi,
      args: [fromSpaceId, toSpaceId, GOVERNANCE_ACTIONS.PROPOSAL_EXECUTED, topic, data, EMPTY_SIGNATURE],
    });

    // Log before transaction for debugging
    console.log('Executing proposal', {
      fromSpaceId,
      toSpaceId,
      proposalId,
      action: 'PROPOSAL_EXECUTED',
    });

    const txEffect = tx(callData);
    const result = await Effect.runPromise(Effect.either(txEffect));

    if (Either.isLeft(result)) {
      const error = result.left;
      console.error(
        `Execute failed: ${error.message}`,
        { fromSpaceId, toSpaceId, proposalId },
        error
      );
      throw error;
    }

    console.log('Execute successful', {
      txHash: result.right,
      fromSpaceId,
      toSpaceId,
      proposalId,
    });

    return result.right;
  }, [personalSpaceId, isRegistered, spaceId, proposalId, tx]);

  const { mutate, status, error } = useMutation({
    mutationFn: handleExecute,
  });

  return {
    execute: mutate,
    status,
    error,
  };
}
